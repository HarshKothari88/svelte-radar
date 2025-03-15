import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as svelte from 'svelte/compiler';
import { ContentItemType, PageContentItem } from '../models/pageContentItem';

/**
 * Provider class for managing page content (sections and components) in the active file
 */
export class PageContentProvider implements vscode.TreeDataProvider<PageContentItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<PageContentItem | undefined>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
    private activeFilePath: string | undefined;
    private timeout: NodeJS.Timeout | undefined;
    // Updated to support both JS and HTML comments
    private sectionRegexJS = /\/\/\s*@sr\s+(.+)/i;
    private sectionRegexHTML = /<!--\s*@sr\s+(.+?)\s*-->/i;
    private svelteComponentRegex = /<([A-Z][A-Za-z0-9_]*)[^>]*>/g;
    private isSvelte5 = false;
    private noItemsMessage = new PageContentItem(
        'No sections or components found',
        ContentItemType.Message,
        '',
        0
    );
    private howToUseMessage = new PageContentItem(
        'Add @sr titles with // @sr Title or <!-- @sr Title -->',
        ContentItemType.Message,
        '',
        0
    );

    constructor() {
        // Watch for active editor changes
        vscode.window.onDidChangeActiveTextEditor(() => {
            this.checkActiveFile();
        });
        
        // Watch for document changes
        vscode.workspace.onDidChangeTextDocument(() => {
            if (this.timeout) {
                clearTimeout(this.timeout);
            }
            this.timeout = setTimeout(() => {
                this.refresh();
            }, 500); // Debounce refreshes
        });

        // Initial check
        this.checkActiveFile();

        // Check if using Svelte 5
        this.checkSvelteVersion();
    }

    private async checkSvelteVersion() {
        try {
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders) return;

            const workspaceRoot = workspaceFolders[0].uri.fsPath;
            const packageJsonPath = path.join(workspaceRoot, 'package.json');
            
            if (fs.existsSync(packageJsonPath)) {
                const content = fs.readFileSync(packageJsonPath, 'utf8');
                const packageJson = JSON.parse(content);
                
                const svelteVersion = packageJson.dependencies?.svelte || packageJson.devDependencies?.svelte;
                if (svelteVersion && svelteVersion.startsWith('^5')) {
                    this.isSvelte5 = true;
                }
            }
        } catch (error) {
            console.error('Error determining Svelte version:', error);
        }
    }

    private checkActiveFile() {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            const filePath = editor.document.uri.fsPath;
            const isSvelteFile = filePath.endsWith('.svelte');
            
            if (isSvelteFile && this.activeFilePath !== filePath) {
                this.activeFilePath = filePath;
                this.refresh();
            } else if (!isSvelteFile && this.activeFilePath) {
                this.activeFilePath = undefined;
                this.refresh();
            }
        } else if (this.activeFilePath) {
            this.activeFilePath = undefined;
            this.refresh();
        }
    }

    private isRouteFile(filePath: string): boolean {
        if (!filePath) return false;
        
        // Check if it's a Svelte file
        return filePath.endsWith('.svelte');
    }

    refresh(): void {
        this._onDidChangeTreeData.fire(undefined);
    }

    getTreeItem(element: PageContentItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: PageContentItem): Promise<PageContentItem[]> {
        // If this is a parent component with multiple instances, return its children
        if (element && element.type === ContentItemType.Component && element.instances && element.instances.length > 1) {
            return element.instances.map((instance, idx) => 
                new PageContentItem(
                    element.label,
                    ContentItemType.ComponentInstance,
                    element.filePath,
                    instance.line,
                    element.componentFilePath,
                    undefined,
                    idx
                )
            );
        }
        
        // For any other leaf node, return empty array
        if (element) {
            return [];
        }

        if (!this.activeFilePath || !fs.existsSync(this.activeFilePath)) {
            return [];
        }

        try {
            const content = fs.readFileSync(this.activeFilePath, 'utf8');
            
            // We'll use this to store all content items in order
            const contentItems: Array<{
                type: ContentItemType,
                name: string,
                line: number,
                componentPath?: string,
                componentName?: string,
                instanceIndex?: number
            }> = [];
            
            // Find sections from JS comments
            const lines = content.split('\n');
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                const jsSectionMatch = line.match(this.sectionRegexJS);
                
                if (jsSectionMatch) {
                    contentItems.push({
                        type: ContentItemType.Section,
                        name: jsSectionMatch[1].trim(),
                        line: i
                    });
                }
            }
            
            // Find sections from HTML comments using a global regex
            const htmlCommentRegex = /<!--\s*@sr\s+(.+?)\s*-->/g;
            let htmlMatch;
            while ((htmlMatch = htmlCommentRegex.exec(content)) !== null) {
                const sectionName = htmlMatch[1].trim();
                const matchPosition = htmlMatch.index;
                
                // Calculate line number
                let lineNumber = 0;
                let charPosition = 0;
                
                for (let i = 0; i < lines.length; i++) {
                    charPosition += lines[i].length + 1; // Add 1 for newline
                    if (charPosition > matchPosition) {
                        lineNumber = i;
                        break;
                    }
                }
                
                contentItems.push({
                    type: ContentItemType.Section,
                    name: sectionName,
                    line: lineNumber
                });
            }
            
            // Find all component instances
            const componentInstances = await this.findComponentInstances(content);
            contentItems.push(...componentInstances);
            
            // Sort all items by line number to maintain the exact order in the file
            contentItems.sort((a, b) => a.line - b.line);
            
            // If no items found, show helper messages
            if (contentItems.length === 0) {
                return [this.noItemsMessage, this.howToUseMessage];
            }
            
            // Group component instances
            const componentMap = new Map<string, Array<{ line: number, index: number }>>();
            
            // First pass - build the component map
            contentItems.forEach((item, index) => {
                if (item.type === ContentItemType.Component) {
                    const key = item.componentName || item.name;
                    if (!componentMap.has(key)) {
                        componentMap.set(key, []);
                    }
                    componentMap.get(key)?.push({
                        line: item.line,
                        index: item.instanceIndex || 0
                    });
                }
            });
            
            // Convert to final items
            const finalItems: PageContentItem[] = [];
            const processedComponents = new Set<string>();
            
            for (const item of contentItems) {
                if (item.type === ContentItemType.Section) {
                    // Add sections directly
                    finalItems.push(new PageContentItem(
                        item.name,
                        ContentItemType.Section,
                        this.activeFilePath,
                        item.line
                    ));
                } else if (item.type === ContentItemType.Component) {
                    const key = item.componentName || item.name;
                    
                    // Skip if we've already processed this component
                    if (processedComponents.has(key)) {
                        continue;
                    }
                    
                    // Mark as processed
                    processedComponents.add(key);
                    
                    // Get all instances for this component
                    const instances = componentMap.get(key) || [];
                    
                    finalItems.push(new PageContentItem(
                        key,
                        ContentItemType.Component,
                        this.activeFilePath,
                        item.line,
                        item.componentPath,
                        instances
                    ));
                }
            }
            
            return finalItems;
        } catch (error) {
            console.error('Error parsing page content:', error);
            return [this.noItemsMessage];
        }
    }

    /**
     * Find all component instances in the content
     */
    private async findComponentInstances(content: string): Promise<Array<{
        type: ContentItemType,
        name: string,
        line: number,
        componentPath?: string,
        componentName: string,
        instanceIndex: number
    }>> {
        try {
            // Try using Svelte's parser for more accurate detection
            const result: Array<{
                type: ContentItemType,
                name: string,
                line: number,
                componentPath?: string,
                componentName: string,
                instanceIndex: number
            }> = [];
            
            // Track instances of each component for proper indexing
            const componentCounts: Record<string, number> = {};
            
            try {
                const ast = svelte.parse(content);
                await this.extractComponentsFromAst(ast, result, componentCounts, content);
                
                if (result.length > 0) {
                    return result;
                }
            } catch (error) {
                console.error('Error using Svelte parser:', error);
            }
            
            // Fallback to regex approach if Svelte parser fails
            const lines = content.split('\n');
            let match;
            const regex = /<([A-Z][A-Za-z0-9_]*)[^>]*>/g;
            
            while ((match = regex.exec(content)) !== null) {
                const componentName = match[1];
                
                if (/^[A-Z]/.test(componentName)) {
                    // Track instance count
                    if (!componentCounts[componentName]) {
                        componentCounts[componentName] = 0;
                    }
                    const instanceIndex = componentCounts[componentName]++;
                    
                    // Find line number of the match
                    const matchPosition = match.index;
                    let lineNumber = 0;
                    let charPosition = 0;
                    
                    for (let i = 0; i < lines.length; i++) {
                        charPosition += lines[i].length + 1; // Add 1 for newline
                        if (charPosition > matchPosition) {
                            lineNumber = i;
                            break;
                        }
                    }
                    
                    // Find component file in workspace
                    const componentPath = await this.findComponentFile(componentName);
                    
                    result.push({
                        type: ContentItemType.Component,
                        name: componentName,
                        line: lineNumber,
                        componentPath,
                        componentName,
                        instanceIndex
                    });
                }
            }
            
            return result;
        } catch (error) {
            console.error('Error finding component instances:', error);
            return [];
        }
    }

    private async extractComponentsFromAst(
        ast: any,
        results: Array<{
            type: ContentItemType,
            name: string,
            line: number,
            componentPath?: string,
            componentName: string,
            instanceIndex: number
        }>,
        componentCounts: Record<string, number>,
        content: string
    ) {
        try {
            // Process HTML part
            if (ast.html) {
                await this.traverseAst(ast.html, results, componentCounts, content);
            }
            
            // Process instance part (script)
            if (ast.instance) {
                await this.traverseAst(ast.instance, results, componentCounts, content);
            }
            
            // Process module part (script context="module")
            if (ast.module) {
                await this.traverseAst(ast.module, results, componentCounts, content);
            }
        } catch (error) {
            console.error('Error extracting components from AST:', error);
        }
    }

    private async traverseAst(
        ast: any,
        results: Array<{
            type: ContentItemType,
            name: string,
            line: number,
            componentPath?: string,
            componentName: string,
            instanceIndex: number
        }>,
        componentCounts: Record<string, number>,
        content: string
    ) {
        if (!ast) return;
        
        try {
            // Check if the node is a component (start with uppercase)
            if (ast.type === 'InlineComponent' && ast.name && /^[A-Z]/.test(ast.name)) {
                const componentName = ast.name;
                
                // Track instance count
                if (!componentCounts[componentName]) {
                    componentCounts[componentName] = 0;
                }
                const instanceIndex = componentCounts[componentName]++;
                
                // Get the line number 
                const lineNumber = this.getLineFromPosition(content, ast.start);
                
                // Find component file in workspace
                const componentPath = await this.findComponentFile(componentName);
                
                results.push({
                    type: ContentItemType.Component,
                    name: componentName,
                    line: lineNumber,
                    componentPath,
                    componentName,
                    instanceIndex
                });
            }
            
            // Recursively process children
            if (ast.children) {
                for (const child of ast.children) {
                    await this.traverseAst(child, results, componentCounts, content);
                }
            }
        } catch (error) {
            console.error('Error traversing AST:', error);
        }
    }

    private getLineFromPosition(content: string, position: number): number {
        const lines = content.substring(0, position).split('\n');
        return lines.length - 1;
    }

    private async findComponentFile(componentName: string): Promise<string | undefined> {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) return undefined;
        
        try {
            // Search for the component file
            const searchResults = await vscode.workspace.findFiles(
                `**/${componentName}.svelte`,
                '**/node_modules/**'
            );
            
            if (searchResults.length > 0) {
                return searchResults[0].fsPath;
            }
            
            return undefined;
        } catch (error) {
            console.error('Error finding component file:', error);
            return undefined;
        }
    }
} 