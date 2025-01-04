import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { RouteItem } from '../models/routeItem';
import { RouteUtils } from '../utils/routeUtils';
import { ResetInfo, RouteMatch, RouteType, SegmentMatch } from '../constant/type';

/**
 * Provider class for managing SvelteKit routes in VS Code
 */
export class RoutesProvider implements vscode.TreeDataProvider<RouteItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<RouteItem | undefined>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
    private port: number;
    private flatView: boolean;
    private searchPattern: string = '';
    private testRoot?: string;

    constructor(testRoot?: string) {
        this.testRoot = testRoot;
        this.flatView = vscode.workspace.getConfiguration('svelteRadar').get('viewType', 'flat') === 'flat';
        const workspaceFolders = vscode.workspace.workspaceFolders;
        this.port = workspaceFolders
            ? RouteUtils.detectPort(workspaceFolders[0].uri.fsPath)
            : 5173;
    }

    refresh(): void {
        this._onDidChangeTreeData.fire(undefined);
    }

    getTreeItem(element: RouteItem): vscode.TreeItem {
        return element;
    }

    getPort(): number {
        return this.port;
    }

    toggleViewType(): void {
        this.flatView = !this.flatView;
        vscode.workspace.getConfiguration('svelteRadar').update('viewType', this.flatView ? 'flat' : 'hierarchical', true);
        this.refresh();
    }

    // Helper method to get routes directory
    private getRoutesDir(): string {
        if (this.testRoot) {
            return path.join(this.testRoot, 'src', 'routes');
        }

        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            throw new Error('No workspace folder found');
        }

        return path.join(workspaceFolders[0].uri.fsPath, 'src', 'routes');
    }

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

    private buildRoutesTree(dir: string, basePath: string): RouteItem[] {
        const entries = fs.readdirSync(dir).filter(file => !file.startsWith("."));
        const routes: RouteItem[] = [];
    
        entries.sort((a, b) => this.compareRoutes(a, b));
    
        for (const entry of entries) {
            const fullPath = path.join(dir, entry);
            const stat = fs.statSync(fullPath);
    
            if (stat.isDirectory()) {
                const routePath = path.join(basePath, entry);
                const routeType = this.determineRouteType(entry);
                const pageInfo = this.findPageInfo(fullPath);
                const children = this.buildRoutesTree(fullPath, routePath);
    
                if (this.flatView) {
                    // In flat view, only add the route if it has a page file
                    if (pageInfo.filePath) {
                        routes.push(new RouteItem(
                            routePath,
                            routePath,
                            pageInfo.filePath,
                            [], // Empty children array in flat view
                            this.port,
                            routeType,
                            false,
                            pageInfo.resetInfo
                        ));
                    }
                    // Add all children regardless
                    routes.push(...children);
                } else {
                    // In hierarchical view
                    if (pageInfo.filePath || routeType === 'group' || children.length > 0) {
                        routes.push(new RouteItem(
                            routePath,
                            routePath,
                            pageInfo.filePath,
                            children,
                            this.port,
                            routeType,
                            true,
                            pageInfo.resetInfo
                        ));
                    }
                }
            }
        }
    
        return routes;
    }

    private determineRouteType(entry: string): RouteType {
        if (entry.startsWith('(') && entry.endsWith(')')) {
            return 'group';
        }
        if (entry.startsWith('[...') && entry.endsWith(']')) {
            return 'rest';
        }
        if (entry.startsWith('[[') && entry.endsWith(']]')) {
            return 'optional';
        }
        if (entry.startsWith('[') && entry.endsWith(']')) {
            return 'dynamic';
        }
        return 'static';
    }

    private findPageInfo(dir: string): { filePath: string; resetInfo: ResetInfo | null } {
        const files = fs.readdirSync(dir);

        // Check for reset pages first
        for (const file of files) {
            if (file.includes('+page@')) {
                const resetInfo = this.parseResetInfo(file);
                if (resetInfo) {
                    return {
                        filePath: path.join(dir, file),
                        resetInfo
                    };
                }
            }
        }

        // Check for regular page
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

    private parseResetInfo(fileName: string): ResetInfo | null {
        const match = fileName.match(/\+page@(.*)\.svelte$/);
        if (!match) { return null; }

        const resetTarget = match[1] || 'root';
        return {
            resetTarget,
            displayName: resetTarget || 'root',
            layoutLevel: 0  // This will be calculated based on path depth
        };
    }

    private flattenRoutes(routes: RouteItem[]): RouteItem[] {
        const routeGroups = new Map<string, RouteItem[]>();

        const processRoute = (item: RouteItem) => {
            const segments = item.routePath.split('\\');
            const topLevel = segments[0] || 'root';

            if (!routeGroups.has(topLevel)) {
                routeGroups.set(topLevel, []);
            }

            // Add the route with its full path
            let displayName = item.routePath;
            if (item.resetInfo) {
                displayName += ` (resets to ${item.resetInfo.displayName})`;
            }

            routeGroups.get(topLevel)?.push(new RouteItem(
                displayName,
                item.routePath,
                item.filePath,
                [],
                this.port,
                item.routeType,
                false,
                item.resetInfo
            ));

            // Process children
            if (item.children.length > 0) {
                item.children.forEach(child => processRoute(child));
            }
        };

        routes.forEach(route => processRoute(route));

        // Create final flat list with dividers
        const flatList: RouteItem[] = [];
        const sortedGroups = Array.from(routeGroups.keys()).sort();

        sortedGroups.forEach(section => {
            // Add section divider
            flatList.push(new RouteItem(
                section,
                '',
                '',
                [],
                this.port,
                'divider'
            ));

            // Add routes for this section
            flatList.push(...(routeGroups.get(section) || []));
        });

        return flatList;
    }

    private compareRoutes(a: string, b: string): number {
        // Static segments win over dynamic segments
        const aIsDynamic = a.includes('[');
        const bIsDynamic = b.includes('[');
        if (!aIsDynamic && bIsDynamic) { return -1; }
        if (aIsDynamic && !bIsDynamic) { return 1; }

        // Rest/optional parameters have lowest priority
        const aIsSpecial = a.startsWith('[...') || a.startsWith('[[');
        const bIsSpecial = b.startsWith('[...') || b.startsWith('[[');
        if (!aIsSpecial && bIsSpecial) { return -1; }
        if (aIsSpecial && !bIsSpecial) { return 1; }

        return 0;
    }

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

    clearSearch() {
        this.searchPattern = '';
        this.refresh();
    }

    private filterRoutes(routes: RouteItem[]): RouteItem[] {
        if (!this.searchPattern) {
            return routes;
        }

        return routes.filter(route => {
            // Don't filter dividers
            if (route.routeType === 'divider') {
                return true;
            }

            const matchesSearch = route.label.toLowerCase().includes(this.searchPattern) ||
                route.routePath.toLowerCase().includes(this.searchPattern);

            if (route.children.length > 0) {
                route.children = this.filterRoutes(route.children);
                return route.children.length > 0 || matchesSearch;
            }

            return matchesSearch;
        });
    }

    private formatRoutePath(path: string, type: RouteType): string {
        const segments = path.split('\\');
        return segments.map(segment => {
            // Handle rest parameters [...param]
            if (segment.startsWith('[...') && segment.endsWith(']')) {
                return `*${segment.slice(4, -1)}`;
            }
            // Handle optional parameters [[param]]
            if (segment.startsWith('[[') && segment.endsWith(']]')) {
                return `?${segment.slice(2, -2)}`;
            }
            // Handle dynamic parameters [param]
            if (segment.startsWith('[') && segment.endsWith(']')) {
                return segment.slice(1, -1);
            }
            // Handle groups (group)
            if (segment.startsWith('(') && segment.endsWith(')')) {
                return segment;
            }
            return segment;
        }).join('\\');
    }

    private getRouteDescription(type: RouteType): string {
        switch (type) {
            case 'dynamic':
                return '[dynamic]';
            case 'rest':
                return '[rest]';
            case 'optional':
                return '[optional]';
            case 'error':
                return '[error]';
            case 'layout':
                return '[layout]';
            case 'group':
                return '[group]';
            default:
                return '[page]';
        }
    }

    /**
     * Opens a route in the editor
     */
    async openRoute(input: string | RouteItem) {
        if (typeof input === 'string') {
            let relativePath: string;

            try {
                // Handle both URLs and direct paths
                if (input.includes('://')) {
                    const url = new URL(input);
                    relativePath = url.pathname;
                } else {
                    // Handle paths that might start with / or not
                    relativePath = input.startsWith('/') ? input.slice(1) : input;
                }

                // Remove trailing slash if present
                relativePath = relativePath.replace(/\/$/, '');

                // Handle empty path (root route)
                if (!relativePath) {
                    relativePath = '/';
                }

                const routeFile = await this.findMatchingRoute(relativePath);

                if (routeFile) {
                    const document = await vscode.workspace.openTextDocument(routeFile);
                    await vscode.window.showTextDocument(document);
                } else {
                    vscode.window.showErrorMessage(`No matching route found for: ${input}`);
                }
            } catch (error) {
                vscode.window.showErrorMessage(`Invalid route or URL format: ${input}`);
            }
        } else {
            if (input.filePath) {
                const document = await vscode.workspace.openTextDocument(input.filePath);
                await vscode.window.showTextDocument(document);
            }
        }
    }

    /**
 * Finds matching route file for given path
 */
    async findMatchingRoute(relativePath: string): Promise<string | null> {
        const routesDir = this.getRoutesDir();

        // Handle root path
        if (relativePath === '/' || relativePath === '') {
            return this.findMostSpecificPage(routesDir);
        }

        const segments = relativePath.split('/').filter(Boolean);
        return this.findMatchingSegments(routesDir, segments);
    }

    private async findMatchingSegments(currentDir: string, segments: string[]): Promise<string | null> {
        if (segments.length === 0) {
            // For optional parameters, we need to look one level deeper even with no segments
            const entries = await fs.promises.readdir(currentDir);
            for (const entry of entries) {
                if (entry.startsWith('[[') && entry.endsWith(']]')) {
                    const fullPath = path.join(currentDir, entry);
                    const optionalMatch = await this.findMostSpecificPage(fullPath);
                    if (optionalMatch) { return optionalMatch; }
                }
            }
            return this.findMostSpecificPage(currentDir);
        }

        const currentSegment = segments[0];
        const entries = await fs.promises.readdir(currentDir);
        let bestMatch: string | null = null;
        let bestScore = -1;

        // First pass: Check for exact and matcher routes
        for (const entry of entries) {
            const fullPath = path.join(currentDir, entry);
            if (!(await fs.promises.stat(fullPath)).isDirectory()) { continue; }

            const routeType = this.getRouteType(entry);
            let match: string | null = null;
            let score = 0;

            if (routeType === 'static' && entry === currentSegment) {
                match = await this.findMatchingSegments(fullPath, segments.slice(1));
                score = 100;
            } else if (routeType === 'matcher') {
                // Only match if the parameter constraint is satisfied
                if (this.isParameterMatchGeneric(currentSegment, entry)) {
                    match = await this.findMatchingSegments(fullPath, segments.slice(1));
                    score = 90;
                }
            }

            if (match && score > bestScore) {
                bestMatch = match;
                bestScore = score;
            }
        }

        // If no match found yet, try other routes
        if (!bestMatch) {
            for (const entry of entries) {
                const fullPath = path.join(currentDir, entry);
                if (!(await fs.promises.stat(fullPath)).isDirectory()) { continue; }

                const routeType = this.getRouteType(entry);
                let match: string | null = null;
                let score = 0;

                switch (routeType) {
                    case 'group':
                        match = await this.findMatchingSegments(fullPath, segments);
                        if (match) { score = 95; }
                        break;
                    case 'dynamic':
                        match = await this.findMatchingSegments(fullPath, segments.slice(1));
                        score = 80;
                        break;
                    case 'optional':
                        match = await this.findMatchingSegments(fullPath, segments.slice(1));
                        if (match) {
                            score = 70;
                        } else {
                            match = await this.findMatchingSegments(fullPath, segments);
                            if (match) { score = 60; }
                        }
                        break;
                    case 'rest':
                        match = await this.findMostSpecificPage(fullPath);
                        score = 50;
                        break;
                }

                if (match && score > bestScore) {
                    bestMatch = match;
                    bestScore = score;
                }
            }
        }

        return bestMatch;
    }

    private findMostSpecificPage(dir: string): string | null {
        if (!fs.existsSync(dir)) { return null; }

        const files = fs.readdirSync(dir);

        // Check for all possible page/server files
        const filePriorities = [
            (f: string) => f.match(/\+page@\([^)]+\)\.svelte$/), // Layout reset with target
            (f: string) => f === '+page@.svelte',                 // Root layout reset
            (f: string) => f === '+server.js',                    // Server route
            (f: string) => f === '+page.svelte'                   // Regular page
        ];

        for (const checkPriority of filePriorities) {
            const matchingFile = files.find(checkPriority);
            if (matchingFile) {
                return path.join(dir, matchingFile);
            }
        }

        return null;
    }

    private isParameterMatchGeneric(value: string, paramPattern: string): boolean {
        const matcherMatch = paramPattern.match(/\[([^=]+)=([^\]]+)\]/);
        if (!matcherMatch) {
            return false;
        }

        const [, paramName, matcher] = matcherMatch;
        const patterns: { [key: string]: RegExp } = {
            integer: /^\d+$/,
            float: /^\d*\.?\d+$/,
            alpha: /^[a-zA-Z]+$/,
            alphanumeric: /^[a-zA-Z0-9]+$/,
            uuid: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
            date: /^\d{4}-\d{2}-\d{2}$/
        };

        return patterns[matcher] ? patterns[matcher].test(value) : true;
    }

    private getRouteType(entry: string): RouteType {
        if (entry.startsWith('(') && entry.endsWith(')')) {
            return 'group';
        }
        if (!entry.includes('[')) {
            return 'static';
        }
        if (entry.startsWith('[[') && entry.endsWith(']]')) {
            return 'optional';
        }
        if (entry.startsWith('[...')) {
            return 'rest';
        }
        if (entry.includes('[') && entry.includes('=')) {
            return 'matcher';
        }
        return 'dynamic';
    }

    /**
     * Opens a route in the browser
     */
    openInBrowser(route: RouteItem) {
        if (route.routePath) {
            const url = `http://localhost:${this.port}${route.routePath.replace(/\\/g, '/')}`;
            vscode.env.openExternal(vscode.Uri.parse(url));
        }
    }
}