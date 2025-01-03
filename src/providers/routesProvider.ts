import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { RouteItem } from '../models/routeItem';
import { RouteUtils } from '../utils/routeUtils';
import { ResetInfo, RouteType } from '../constant/type';

/**
 * Provider class for managing SvelteKit routes in VS Code
 */
export class RoutesProvider implements vscode.TreeDataProvider<RouteItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<RouteItem | undefined>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
    private port: number;
    private flatView: boolean;
    private searchPattern: string = '';

    constructor() {
        this.flatView = vscode.workspace.getConfiguration('svelteRadar').get('viewType', 'flat') === 'flat';
        const workspaceFolders = vscode.workspace.workspaceFolders;
        this.port = workspaceFolders
            ? RouteUtils.detectPort(workspaceFolders[0].uri.fsPath)
            : 5173;
    }

    /**
     * Prompts user for search input and filters routes
     */
    async search() {
        const searchInput = await vscode.window.showInputBox({
            prompt: "Search routes",
            placeHolder: "Enter route path or name"
        });

        if (searchInput !== undefined) {
            this.searchPattern = searchInput.toLowerCase();
            this.refresh();
        }
    }

    /**
     * Clears current search filter
     */
    clearSearch() {
        this.searchPattern = '';
        this.refresh();
    }

    /**
     * Filters routes based on search pattern
     */
    private filterRoutes(routes: RouteItem[]): RouteItem[] {
        if (!this.searchPattern) { return routes; }

        return routes.filter(route => {
            const matchesSearch =
                route.label.toLowerCase().includes(this.searchPattern) ||
                route.routePath.toLowerCase().includes(this.searchPattern);

            if (route.children.length > 0) {
                route.children = this.filterRoutes(route.children);
                return route.children.length > 0 || matchesSearch;
            }

            return matchesSearch;
        });
    }

    getPort(): number {
        return this.port;
    }

    refresh(): void {
        this._onDidChangeTreeData.fire(undefined);
    }

    toggleViewType(): void {
        this.flatView = !this.flatView;
        vscode.workspace.getConfiguration('svelteRadar').update('viewType', this.flatView ? 'flat' : 'hierarchical', true);
        this.refresh();
    }

    getTreeItem(element: RouteItem): vscode.TreeItem {
        return element;
    }

    /**
     * Gets children for tree view
     */
    async getChildren(element?: RouteItem): Promise<RouteItem[]> {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) { return []; }

        const routesDir = path.join(workspaceFolders[0].uri.fsPath, "src", "routes");
        if (!fs.existsSync(routesDir)) {
            vscode.window.showErrorMessage("SvelteKit routes directory not found.");
            return [];
        }

        if (this.flatView && !element) {
            const routes = this.buildRoutesTree(routesDir, "");
            const flatRoutes = this.flattenRoutes(routes);
            return this.filterRoutes(flatRoutes);
        }

        if (!element) {
            const routes = this.buildRoutesTree(routesDir, "");
            return this.filterRoutes(routes);
        }

        return this.filterRoutes(element.children || []);
    }

    /**
   * Parses reset information from a page file name
   * Returns null if it's not a reset page
   */
    private parseResetInfo(fileName: string, currentPath: string): ResetInfo | null {
        const resetMatch = fileName.match(/\+page@([^.]+)?\.svelte$/);
        if (!resetMatch) { return null; }

        const resetTarget = resetMatch[1] || '';  // Empty string means root

        // Split the current path into segments
        const pathSegments = currentPath
            .split('/')
            .filter(Boolean)
            .map(segment => this.stripGroupPrefix(segment));

        if (resetTarget === '') {
            return {
                resetTarget: '',
                displayName: 'root',
                layoutLevel: pathSegments.length
            };
        }

        // Find the target layout level
        const targetIndex = pathSegments.findIndex(segment =>
            this.normalizeSegment(segment) === this.normalizeSegment(resetTarget)
        );

        if (targetIndex === -1) {
            console.warn(`Reset target "${resetTarget}" not found in path ${currentPath}`);
            return null;
        }

        return {
            resetTarget,
            displayName: resetTarget,
            layoutLevel: pathSegments.length - targetIndex - 1
        };
    }

    /**
     * Strips group prefix from segment if present
     */
    private stripGroupPrefix(segment: string): string {
        return segment.replace(/^\((.*?)\)/, '');
    }

    /**
     * Normalizes segment for comparison
     * Handles dynamic params, groups, etc.
     */
    private normalizeSegment(segment: string): string {
        // Remove group parentheses
        segment = this.stripGroupPrefix(segment);

        // Handle dynamic parameters
        if (segment.startsWith('[') && segment.endsWith(']')) {
            // Extract param name without constraints
            segment = segment.replace(/\[([^\]=]+)(=.+)?\]/, '$1');
        }

        return segment;
    }

    /**
     * Finds the appropriate page file and its reset level
     */
    private findPageInfo(dir: string, currentPath: string): {
        filePath: string;
        resetInfo: ResetInfo | null;
    } {
        const files = fs.readdirSync(dir);

        // Check for reset pages first
        for (const file of files) {
            if (file.includes('+page@')) {
                const resetInfo = this.parseResetInfo(file, currentPath);
                if (resetInfo) {
                    return {
                        filePath: path.join(dir, file),
                        resetInfo
                    };
                }
            }
        }

        // Fall back to regular page
        const regularPage = files.find(f => f === '+page.svelte');
        if (regularPage) {
            return {
                filePath: path.join(dir, regularPage),
                resetInfo: null
            };
        }

        return {
            filePath: '',
            resetInfo: null
        };
    }


    /**
  * Builds route tree with advanced routing support
  */
    private buildRoutesTree(dir: string, basePath: string): RouteItem[] {
        const entries = fs.readdirSync(dir).filter(file => !file.startsWith("."));
        const routes: RouteItem[] = [];
        const processedRoutes = new Set<string>();

        entries.sort((a, b) => this.compareRoutes(a, b));

        for (const entry of entries) {
            const fullPath = path.join(dir, entry);
            const stat = fs.statSync(fullPath);

            const isGroup = entry.startsWith('(') && entry.endsWith(')');
            const routePath = isGroup
                ? basePath
                : RouteUtils.normalizeRouteName(path.join(basePath, RouteUtils.formatRouteName(entry)));

            if (processedRoutes.has(routePath)) { continue; }
            processedRoutes.add(routePath);

            if (stat.isDirectory()) {
                const children = this.buildRoutesTree(fullPath, routePath);
                const routeType = this.determineRouteType(entry, fullPath);

                // Find page information including reset details
                const { filePath, resetInfo } = this.findPageInfo(fullPath, routePath);
                const hasPage = filePath !== '';

                if (hasPage || children.length > 0) {
                    const displayName = this.formatDisplayName(entry, resetInfo);

                    routes.push(new RouteItem(
                        displayName,
                        routePath,
                        filePath,
                        children,
                        this.port,
                        routeType,
                        !this.flatView,
                        resetInfo
                    ));
                }
            }
        }

        return routes;
    }

    /**
    * Compares routes according to SvelteKit's ranking system
    */
    private compareRoutes(a: string, b: string): number {
        // 1. Static segments win over dynamic segments
        const aIsDynamic = a.includes('[');
        const bIsDynamic = b.includes('[');
        if (!aIsDynamic && bIsDynamic) { return -1; }
        if (aIsDynamic && !bIsDynamic) { return 1; }

        // 2. Parameters with matchers win over those without
        const aHasMatcher = a.includes('=');
        const bHasMatcher = b.includes('=');
        if (aHasMatcher && !bHasMatcher) { return -1; }
        if (!aHasMatcher && bHasMatcher) { return 1; }

        // 3. Rest and optional parameters have lowest priority
        const aIsRestOrOptional = a.startsWith('[...') || a.startsWith('[[');
        const bIsRestOrOptional = b.startsWith('[...') || b.startsWith('[[');
        if (!aIsRestOrOptional && bIsRestOrOptional) { return -1; }
        if (aIsRestOrOptional && !bIsRestOrOptional) { return 1; }

        // 4. Return 0 for ties to keep original order
        return 0;
    }


    /**
   * formatDisplayName to include reset information
   */
    private formatDisplayName(entry: string, resetInfo: ResetInfo | null): string {
        let displayName = this.basicFormatDisplayName(entry);

        if (resetInfo) {
            displayName += ` (resets to ${resetInfo.displayName})`;
        }

        return displayName;
    }


    /**
   * Basic display name formatting
     */
    private basicFormatDisplayName(entry: string): string {
        // Remove group parentheses
        if (entry.startsWith('(') && entry.endsWith(')')) {
            return entry.slice(1, -1) + ' (group)';
        }

        // Handle rest parameters
        if (entry.startsWith('[...') && entry.endsWith(']')) {
            return `*${entry.slice(4, -1)}`;
        }

        // Handle optional parameters
        if (entry.startsWith('[[') && entry.endsWith(']]')) {
            return `?${entry.slice(2, -2)}`;
        }

        // Handle parameters with matchers
        if (entry.includes('=')) {
            const [param, matcher] = entry.slice(1, -1).split('=');
            return `${param} (${matcher})`;
        }

        // Handle regular parameters
        if (entry.startsWith('[') && entry.endsWith(']')) {
            return entry.slice(1, -1);
        }

        return entry;
    }


    /**
     * Flattens route tree into list with dividers
     */
    private flattenRoutes(routes: RouteItem[]): RouteItem[] {
        // Create a map to store routes by their top-level segment
        const routeGroups = new Map<string, RouteItem[]>();
        
        const getTopLevelSegment = (path: string): string => {
            // Remove leading colon if present
            const segments = path.split('\\').filter(Boolean);
            return segments[0] || 'root';
        };
    
        // First pass: organize routes into groups
        const organizeRoutes = (items: RouteItem[]) => {
            items.forEach(item => {
                const segment = getTopLevelSegment(item.routePath);
                
                if (!routeGroups.has(segment)) {
                    routeGroups.set(segment, []);
                }
                
                routeGroups.get(segment)?.push(new RouteItem(
                    item.routePath,
                    item.routePath,
                    item.filePath,
                    [],
                    this.port,
                    item.routeType
                ));
    
                if (item.children.length > 0) {
                    organizeRoutes(item.children);
                }
            });
        };
    
        organizeRoutes(routes);
    
        // Second pass: create flat list with dividers
        const flatList: RouteItem[] = [];
        const sortedGroups = Array.from(routeGroups.keys()).sort();
    
        sortedGroups.forEach((groupName, index) => {
            // Add divider for each group (except possibly root)
            if (groupName !== 'root') {
                flatList.push(new RouteItem(
                    `━━━━━ ${groupName} ━━━━━`,  // Make divider more visible
                    '',
                    '',
                    [],
                    this.port,
                    'divider'
                ));
            }
    
            // Add all routes for this group
            const groupRoutes = routeGroups.get(groupName) || [];
            flatList.push(...groupRoutes);
        });
    
        return flatList;
    }

    /**
      * Determines route type from file/folder name
      */
    private determineRouteType(entry: string, fullPath: string): RouteType {
        // Check for error pages first
        if (entry === '+error.svelte' || entry.endsWith('/+error.svelte')) {
            return 'error';
        }
        // Then check for groups
        if (entry.startsWith('(') && entry.endsWith(')')) {
            return 'group';
        }
        // Then layouts
        if (entry.includes('+layout')) {
            return 'layout';
        }
        // Then dynamic routes
        if (entry.startsWith('[...')) {
            return 'rest';
        }
        if (entry.startsWith('[[')) {
            return 'optional';
        }
        if (entry.startsWith('[')) {
            return 'dynamic';
        }
        return 'static';
    }

    /**
     * Opens route file from URL or path input
     */
    async openRoute(input: string) {
        const relativePath = input.replace(/^(http:\/\/localhost(:\d+)?|\/)/, '');
        const routeFile = await this.findMatchingRoute(relativePath);

        if (routeFile) {
            vscode.window.showTextDocument(vscode.Uri.file(routeFile));
        } else {
            vscode.window.showErrorMessage(`No matching route found for: ${input}`);
        }
    }

    /**
     * Finds matching route file for given path
     */
    private async findMatchingRoute(relativePath: string): Promise<string | null> {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) { return null; }

        const routesDir = path.join(workspaceFolders[0].uri.fsPath, "src", "routes");
        const segments = relativePath.split('/').filter(Boolean);
        let currentDir = routesDir;

        for (const segment of segments) {
            const entries = fs.readdirSync(currentDir);

            // Try exact match first
            const exactMatch = entries.find(entry => entry === segment || entry === `[${segment}]`);
            if (exactMatch) {
                currentDir = path.join(currentDir, exactMatch);
                continue;
            }

            // Try dynamic route match
            const dynamicMatch = entries.find(entry =>
                (entry.startsWith('[') && entry.endsWith(']')) ||
                (entry.startsWith('[...') && entry.endsWith(']'))
            );

            if (dynamicMatch) {
                currentDir = path.join(currentDir, dynamicMatch);
                continue;
            }

            return null;
        }

        const pagePath = path.join(currentDir, '+page.svelte');
        return fs.existsSync(pagePath) ? pagePath : null;
    }
}