import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import * as svelte from "svelte/compiler";
import { ContentItemType, PageContentItem } from "../models/pageContentItem";
import { WorkspaceConfig } from "../constant/workspace-config.type";

// Interface for cache entries
interface CacheEntry {
  items: PageContentItem[];
  timestamp: number;
  contentHash: string;
}

/**
 * Provider class for managing page content (sections and components) in the active file
 */
export class PageContentProvider
  implements vscode.TreeDataProvider<PageContentItem>
{
  private _onDidChangeTreeData = new vscode.EventEmitter<
    PageContentItem | undefined
  >();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
  private activeFilePath: string | undefined;
  private timeout: NodeJS.Timeout | undefined;
  // Updated to support both JS and HTML comments
  private sectionRegexJS = /\/\/\s*@sr\s+(.+)/i;
  private sectionRegexHTML = /<!--\s*@sr\s+(.+?)\s*-->/i;
  private svelteComponentRegex =
    /<([A-Z][A-Za-z0-9_]+)(?:\s+[^>]*)?(?:\/?>|\/>)/g;
  private isSvelte5 = false;
  private noItemsMessage = new PageContentItem(
    "No sections or components found",
    ContentItemType.Message,
    "",
    0
  );
  private howToUseMessage = new PageContentItem(
    "Add @sr titles with <!-- @sr Title --> or // @sr Title for javascript",
    ContentItemType.Message,
    "",
    0
  );

  // Cache for page content to improve performance
  private contentCache = new Map<string, CacheEntry>();
  // Maximum cache age in milliseconds (5 minutes)
  private maxCacheAge = 5 * 60 * 1000;
  // Maximum cache size
  private maxCacheSize = 20;

  constructor() {
    const config = this.readWorkspaceConfig();
    const isPageContentViewEnabled = config.enablePageContentView ?? true;

    if (!isPageContentViewEnabled) {
        // If disabled, show a message and do not initialize the provider
        vscode.window.showInformationMessage(
            "Page Content View is disabled for this project. Change 'enablePageContentView' to true in svelte-radar.json to enable it."
        );
        return;
    }

    // Watch for active editor changes
    vscode.window.onDidChangeActiveTextEditor(() => {
      this.checkActiveFile();
    });

    // Watch for document changes
    vscode.workspace.onDidChangeTextDocument((event) => {
      // Only process if it's the active file
      if (event.document.uri.fsPath === this.activeFilePath) {
        if (this.timeout) {
          clearTimeout(this.timeout);
        }
        this.timeout = setTimeout(() => {
          // Invalidate cache for this file
          this.contentCache.delete(event.document.uri.fsPath);
          this.refresh();
        }, 500); // Debounce refreshes
      }
    });

    // Initial check
    this.checkActiveFile();

    // Check if using Svelte 5
    this.checkSvelteVersion();

    // Set up cache cleanup interval
    setInterval(() => this.cleanupCache(), 10 * 60 * 1000); // Clean up every 10 minutes
  }

  private readWorkspaceConfig(): WorkspaceConfig {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
      return {};
    }

    const workspaceRoot = workspaceFolders[0].uri.fsPath;
    const configPath = path.join(workspaceRoot, ".vscode", "svelte-radar.json");

    let config: WorkspaceConfig = {};

    if (fs.existsSync(configPath)) {
      try {
        config = JSON.parse(fs.readFileSync(configPath, "utf8"));
      } catch (error) {
        console.error("Error reading workspace config:", error);
      }
    }
    return config;
  }

  private async checkSvelteVersion() {
    try {
      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (!workspaceFolders) return;

      const workspaceRoot = workspaceFolders[0].uri.fsPath;
      const packageJsonPath = path.join(workspaceRoot, "package.json");

      if (fs.existsSync(packageJsonPath)) {
        const content = fs.readFileSync(packageJsonPath, "utf8");
        const packageJson = JSON.parse(content);

        const svelteVersion =
          packageJson.dependencies?.svelte ||
          packageJson.devDependencies?.svelte;
        if (svelteVersion && svelteVersion.startsWith("^5")) {
          this.isSvelte5 = true;
        }
      }
    } catch (error) {
      console.error("Error determining Svelte version:", error);
    }
  }

  private checkActiveFile() {
    const editor = vscode.window.activeTextEditor;
    if (editor) {
      const filePath = editor.document.uri.fsPath;
      const isSvelteFile = filePath.endsWith(".svelte");

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
    return filePath.endsWith(".svelte");
  }

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: PageContentItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: PageContentItem): Promise<PageContentItem[]> {
    // If this is a parent component with multiple instances, return its children
    if (
      element &&
      element.type === ContentItemType.Component &&
      element.instances &&
      element.instances.length > 1
    ) {
      return element.instances.map(
        (instance, idx) =>
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
      // Check cache first
      const cachedResult = this.checkCache(this.activeFilePath);
      if (cachedResult) {
        return cachedResult;
      }

      // If not in cache, process the file
      const content = fs.readFileSync(this.activeFilePath, "utf8");
      const contentHash = this.hashContent(content);

      // We'll use this to store all content items in order
      const contentItems: Array<{
        type: ContentItemType;
        name: string;
        line: number;
        componentPath?: string;
      }> = [];

      // Find sections from JS comments
      const lines = content.split("\n");
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const jsSectionMatch = line.match(this.sectionRegexJS);

        if (jsSectionMatch) {
          contentItems.push({
            type: ContentItemType.SectionJS,
            name: jsSectionMatch[1].trim(),
            line: i,
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
          type: ContentItemType.SectionHTML,
          name: sectionName,
          line: lineNumber,
        });
      }

      // Find all component instances using Svelte's parser for reliability
      const componentItems = await this.findAllComponents(content);
      contentItems.push(...componentItems);

      // Sort all items by line number to maintain the exact order in the file
      contentItems.sort((a, b) => a.line - b.line);

      // If no items found, show helper messages
      if (contentItems.length === 0) {
        return [this.noItemsMessage, this.howToUseMessage];
      }

      // Group component instances
      const componentMap = new Map<
        string,
        Array<{ line: number; index: number }>
      >();

      // First pass - build the component map
      contentItems.forEach((item, index) => {
        if (item.type === ContentItemType.Component) {
          if (!componentMap.has(item.name)) {
            componentMap.set(item.name, []);
          }
          componentMap.get(item.name)?.push({
            line: item.line,
            index: componentMap.get(item.name)?.length || 0,
          });
        }
      });

      // Convert to final items
      const finalItems: PageContentItem[] = [];
      const processedComponents = new Set<string>();

      for (const item of contentItems) {
        if (
          item.type === ContentItemType.SectionJS ||
          item.type === ContentItemType.SectionHTML
        ) {
          // Add sections directly
          finalItems.push(
            new PageContentItem(
              item.name,
              item.type,
              this.activeFilePath,
              item.line
            )
          );
        } else if (item.type === ContentItemType.Component) {
          // Skip if we've already processed this component
          if (processedComponents.has(item.name)) {
            continue;
          }

          // Mark as processed
          processedComponents.add(item.name);

          // Get all instances for this component
          const instances = componentMap.get(item.name) || [];

          finalItems.push(
            new PageContentItem(
              item.name,
              ContentItemType.Component,
              this.activeFilePath,
              item.line,
              item.componentPath,
              instances
            )
          );
        }
      }

      // Cache the result
      this.cacheResult(this.activeFilePath, finalItems, contentHash);

      return finalItems;
    } catch (error) {
      console.error("Error parsing page content:", error);
      return [this.noItemsMessage];
    }
  }

  /**
   * Find all components using multiple methods for maximum reliability
   */
  private async findAllComponents(content: string): Promise<
    Array<{
      type: ContentItemType;
      name: string;
      line: number;
      componentPath?: string;
    }>
  > {
    // Combined results from all methods
    const allComponents: Array<{
      type: ContentItemType;
      name: string;
      line: number;
      componentPath?: string;
    }> = [];

    try {
      // Method 1: Try using Svelte's parser
      try {
        const svelteComponents = await this.findComponentsWithSvelteParser(
          content
        );
        allComponents.push(...svelteComponents);
      } catch (error) {
        console.error("Error using Svelte parser:", error);
      }

      // Method 2: Use regex to find components (as backup and to catch any missed by the parser)
      const regexComponents = await this.findComponentsWithRegex(content);

      // Merge results, avoiding duplicates
      const existingLines = new Set(
        allComponents.map((c) => `${c.name}:${c.line}`)
      );

      for (const component of regexComponents) {
        const key = `${component.name}:${component.line}`;
        if (!existingLines.has(key)) {
          existingLines.add(key);
          allComponents.push(component);
        }
      }

      return allComponents;
    } catch (error) {
      console.error("Error finding components:", error);
      return [];
    }
  }

  /**
   * Find components using Svelte's parser
   */
  private async findComponentsWithSvelteParser(content: string): Promise<
    Array<{
      type: ContentItemType;
      name: string;
      line: number;
      componentPath?: string;
    }>
  > {
    const components: Array<{
      type: ContentItemType;
      name: string;
      line: number;
      componentPath?: string;
    }> = [];

    try {
      const ast = svelte.parse(content);

      // Process HTML part
      if (ast.html) {
        await this.extractComponentsFromNode(ast.html, components, content);
      }

      return components;
    } catch (error) {
      console.error("Error parsing with Svelte parser:", error);
      return [];
    }
  }

  /**
   * Recursively extract components from AST nodes
   */
  private async extractComponentsFromNode(
    node: any,
    components: Array<{
      type: ContentItemType;
      name: string;
      line: number;
      componentPath?: string;
    }>,
    content: string
  ): Promise<void> {
    if (!node) return;

    try {
      // Check if the node is a component (starts with uppercase)
      if (
        node.type === "InlineComponent" &&
        node.name &&
        /^[A-Z]/.test(node.name)
      ) {
        const componentName = node.name;
        const lineNumber = this.getLineFromPosition(content, node.start);

        // Find component file
        const componentPath = await this.findComponentFile(componentName);

        components.push({
          type: ContentItemType.Component,
          name: componentName,
          line: lineNumber,
          componentPath,
        });
      }

      // Process children recursively
      if (node.children) {
        for (const child of node.children) {
          await this.extractComponentsFromNode(child, components, content);
        }
      }
    } catch (error) {
      console.error("Error extracting component from node:", error);
    }
  }

  /**
   * Find components using regex as a fallback method
   */
  private async findComponentsWithRegex(content: string): Promise<
    Array<{
      type: ContentItemType;
      name: string;
      line: number;
      componentPath?: string;
    }>
  > {
    const components: Array<{
      type: ContentItemType;
      name: string;
      line: number;
      componentPath?: string;
    }> = [];

    try {
      const lines = content.split("\n");

      // Reset regex
      this.svelteComponentRegex.lastIndex = 0;

      // Find all component tags
      let match;
      while ((match = this.svelteComponentRegex.exec(content)) !== null) {
        const componentName = match[1];

        // Ensure it's a component (starts with uppercase)
        if (/^[A-Z]/.test(componentName)) {
          // Calculate line number
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

          // Find component file
          const componentPath = await this.findComponentFile(componentName);

          components.push({
            type: ContentItemType.Component,
            name: componentName,
            line: lineNumber,
            componentPath,
          });
        }
      }

      // Also try line-by-line regex for better reliability
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const lineComponentRegex =
          /<([A-Z][A-Za-z0-9_]+)(?:\s+[^>]*)?(?:\/?>|\/>)/g;

        let lineMatch;
        while ((lineMatch = lineComponentRegex.exec(line)) !== null) {
          const componentName = lineMatch[1];

          // Find component file
          const componentPath = await this.findComponentFile(componentName);

          components.push({
            type: ContentItemType.Component,
            name: componentName,
            line: i,
            componentPath,
          });
        }
      }

      return components;
    } catch (error) {
      console.error("Error finding components with regex:", error);
      return [];
    }
  }

  /**
   * Check if we have a valid cached result for the file
   */
  private checkCache(filePath: string): PageContentItem[] | null {
    const cacheEntry = this.contentCache.get(filePath);
    if (!cacheEntry) {
      return null;
    }

    // Check if cache is still valid (not too old)
    const now = Date.now();
    if (now - cacheEntry.timestamp > this.maxCacheAge) {
      this.contentCache.delete(filePath);
      return null;
    }

    // Check if file content has changed
    try {
      const content = fs.readFileSync(filePath, "utf8");
      const currentHash = this.hashContent(content);

      if (currentHash !== cacheEntry.contentHash) {
        this.contentCache.delete(filePath);
        return null;
      }

      return cacheEntry.items;
    } catch (error) {
      // If there's an error reading the file, invalidate cache
      this.contentCache.delete(filePath);
      return null;
    }
  }

  /**
   * Cache the result for future use
   */
  private cacheResult(
    filePath: string,
    items: PageContentItem[],
    contentHash: string
  ): void {
    // Ensure cache doesn't grow too large
    if (this.contentCache.size >= this.maxCacheSize) {
      // Find the oldest entry
      let oldestPath = "";
      let oldestTime = Date.now();

      for (const [path, entry] of this.contentCache.entries()) {
        if (entry.timestamp < oldestTime) {
          oldestTime = entry.timestamp;
          oldestPath = path;
        }
      }

      // Remove the oldest entry
      if (oldestPath) {
        this.contentCache.delete(oldestPath);
      }
    }

    // Add new entry
    this.contentCache.set(filePath, {
      items,
      timestamp: Date.now(),
      contentHash,
    });
  }

  /**
   * Clean up old cache entries
   */
  private cleanupCache(): void {
    const now = Date.now();

    for (const [path, entry] of this.contentCache.entries()) {
      if (now - entry.timestamp > this.maxCacheAge) {
        this.contentCache.delete(path);
      }
    }
  }

  /**
   * Create a simple hash of the content for cache validation
   */
  private hashContent(content: string): string {
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return hash.toString(16);
  }

  private getLineFromPosition(content: string, position: number): number {
    const lines = content.substring(0, position).split("\n");
    return lines.length - 1;
  }

  private async findComponentFile(
    componentName: string
  ): Promise<string | undefined> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) return undefined;

    try {
      // Search for the component file
      const searchResults = await vscode.workspace.findFiles(
        `**/${componentName}.svelte`,
        "**/node_modules/**"
      );

      if (searchResults.length > 0) {
        return searchResults[0].fsPath;
      }

      return undefined;
    } catch (error) {
      console.error("Error finding component file:", error);
      return undefined;
    }
  }
}
