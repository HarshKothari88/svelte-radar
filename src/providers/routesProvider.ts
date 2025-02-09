import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { RouteItem } from "../models/routeItem";
import { RouteUtils } from "../utils/routeUtils";
import {
  ResetInfo,
  RouteFileInfo,
  RouteMatch,
  RouteType,
  SegmentMatch,
} from "../constant/type";
import { WorkspaceConfig } from "../constant/workspace-config.type";

/**
 * Provider class for managing SvelteKit routes in VS Code
 */
export class RoutesProvider implements vscode.TreeDataProvider<RouteItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<
    RouteItem | undefined
  >();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
  private config: WorkspaceConfig;
  private port: number;
  private flatView: boolean;
  private searchPattern: string = "";
  private testRoot?: string;
  private timeout: NodeJS.Timeout | undefined;

  constructor(testRoot?: string) {
    this.testRoot = testRoot;
    this.flatView =
      vscode.workspace
        .getConfiguration("svelteRadar")
        .get("viewType", "flat") === "flat";
    this.config = this.readWorkspaceConfig();
    this.port = this.getPort();

    // Watch for config file changes
    const watcher = vscode.workspace.createFileSystemWatcher(
      "**/.vscode/svelte-radar.json"
    );
    watcher.onDidChange(() => this.refresh());
    watcher.onDidCreate(() => this.refresh());
    watcher.onDidDelete(() => this.refresh());

    vscode.commands.executeCommand(
      "setContext",
      "svelteRadar:hasSearchTerm",
      false
    );

    vscode.window.onDidChangeActiveTextEditor(() => {
      if(this.searchPattern) {
        return; // Don't refresh if we're in search mode
      }
      if (this.timeout) {
        clearTimeout(this.timeout);
      }
      this.timeout = setTimeout(() => {
        this.refresh();
      }, 500); // Delay for 500 milliseconds
    });
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

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: RouteItem): vscode.TreeItem {
    return element;
  }

  getPort(): number {
    return this.config.port || 5173;
  }

  toggleViewType(): void {
    this.flatView = !this.flatView;
    vscode.workspace
      .getConfiguration("svelteRadar")
      .update("viewType", this.flatView ? "flat" : "hierarchical", true);
    this.refresh();
  }

  // Helper method to get routes directory
  getRoutesDir(): string {
    if (this.testRoot) {
      return path.join(this.testRoot, "src", "routes");
    }

    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
      throw new Error("No workspace folder found");
    }

    const workspaceRoot = workspaceFolders[0].uri.fsPath;
    return path.join(
      workspaceRoot,
      this.config.projectRoot || "",
      "src/routes"
    );
  }

  async getChildren(element?: RouteItem): Promise<RouteItem[]> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
      return [];
    }

    const routesDir = this.getRoutesDir();
    if (!fs.existsSync(routesDir)) {
      vscode.window.showErrorMessage("SvelteKit routes directory not found.");
      return [];
    }

    // If there's a search pattern, apply it only at the root level
    if (this.searchPattern) {
      if (!element) {
        // Only filter at root level
        if (this.flatView) {
          const routes = this.buildRoutesTree(routesDir, "");
          const flatRoutes = this.flattenRoutes(routes);
          return this.filterRoutes(flatRoutes);
        } else {
          const routes = this.buildRoutesTree(routesDir, "");
          const filtered = this.filterRoutes(routes);
          return filtered;
        }
      } else {
        // For child nodes during search, just return children without filtering
        return element.children || [];
      }
    }

    // Normal behavior without search
    if (this.flatView && !element) {
      const routes = this.buildRoutesTree(routesDir, "");
      return this.flattenRoutes(routes);
    }

    if (!element) {
      return this.buildRoutesTree(routesDir, "");
    }

    return element.children || [];
  }

  private buildRoutesTree(dir: string, basePath: string): RouteItem[] {
    const entries = fs.readdirSync(dir).filter((file) => !file.startsWith("."));
    const routes: RouteItem[] = [];

    entries.sort((a, b) => this.compareRoutes(a, b));

    // Process root level files
    if (!basePath) {
      const fileInfos = this.findPageInfo(dir);
      for (const fileInfo of fileInfos) {
        routes.push(
          new RouteItem(
            "/",
            "/",
            fileInfo.filePath,
            [],
            this.port,
            "static",
            !this.flatView, // Use hierarchical view flag
            fileInfo.resetInfo,
            fileInfo.fileType
          )
        );
      }
    }

    // Process directories
    for (const entry of entries) {
      const fullPath = path.join(dir, entry);
      const stat = fs.statSync(fullPath);

      if (stat.isDirectory()) {
        const routePath = path.join(basePath, entry);
        const routeType = this.determineRouteType(entry);
        const dirFileInfos = this.findPageInfo(fullPath);
        const children = this.buildRoutesTree(fullPath, routePath);

        if (this.flatView) {
          // Flat view logic remains unchanged
          for (const fileInfo of dirFileInfos) {
            routes.push(
              new RouteItem(
                routePath,
                routePath,
                fileInfo.filePath,
                [],
                this.port,
                routeType,
                false,
                fileInfo.resetInfo,
                fileInfo.fileType
              )
            );
          }
          routes.push(...children);
        } else {
          // Enhanced hierarchical view logic
          const routeFiles: RouteItem[] = [];

          // Add all directory files as direct children
          for (const fileInfo of dirFileInfos) {
            routeFiles.push(
              new RouteItem(
                path.basename(fileInfo.filePath),
                routePath,
                fileInfo.filePath,
                [],
                this.port,
                routeType,
                true,
                fileInfo.resetInfo,
                fileInfo.fileType
              )
            );
          }

          // Create directory node with all children
          if (routeFiles.length > 0 || children.length > 0) {
            routes.push(
              new RouteItem(
                entry,
                routePath,
                dirFileInfos[0]?.filePath || "",
                [...routeFiles, ...children],
                this.port,
                routeType,
                true,
                dirFileInfos[0]?.resetInfo || null,
                dirFileInfos[0]?.fileType || "page"
              )
            );
          }
        }
      }
    }

    return routes;
  }

  private determineRouteType(entry: string): RouteType {
    if (entry.startsWith("(") && entry.endsWith(")")) {
      return "group";
    }
    if (entry.startsWith("[...") && entry.endsWith("]")) {
      return "rest";
    }
    if (entry.startsWith("[[") && entry.endsWith("]]")) {
      return "optional";
    }
    if (entry.startsWith("[") && entry.endsWith("]")) {
      return "dynamic";
    }
    return "static";
  }

  private findPageInfo(dir: string): RouteFileInfo[] {
    const files = fs.readdirSync(dir);
    const fileInfos: RouteFileInfo[] = [];

    // Check each file in the directory
    for (const file of files) {
      // Skip non-route files
      if (!file.startsWith("+")) {
        continue;
      }

      // Check for reset pages first
      if (file.includes("+page@")) {
        const resetInfo = this.parseResetInfo(file);
        fileInfos.push({
          filePath: path.join(dir, file),
          fileType: "page",
          resetInfo,
        });
        continue;
      }

      // Determine file type
      if (file.startsWith("+page.svelte")) {
        fileInfos.push({
          filePath: path.join(dir, file),
          fileType: "page",
          resetInfo: null,
        });
      } else if (file.startsWith("+page.ts")) {
        fileInfos.push({
          filePath: path.join(dir, file),
          fileType: "pageClient",
          resetInfo: null,
        });
      } else if (file.startsWith("+page.server.ts")) {
        fileInfos.push({
          filePath: path.join(dir, file),
          fileType: "pageServer",
          resetInfo: null,
        });
      } else if (file.startsWith("+server.ts")) {
        fileInfos.push({
          filePath: path.join(dir, file),
          fileType: "server",
          resetInfo: null,
        });
      } else if (file.startsWith("+layout.svelte")) {
        fileInfos.push({
          filePath: path.join(dir, file),
          fileType: "layout",
          resetInfo: null,
        });
      } else if (file.startsWith("+layout.ts")) {
        fileInfos.push({
          filePath: path.join(dir, file),
          fileType: "layoutClient",
          resetInfo: null,
        });
      } else if (file.startsWith("+layout.server.ts")) {
        fileInfos.push({
          filePath: path.join(dir, file),
          fileType: "layoutServer",
          resetInfo: null,
        });
      } else if (file.startsWith("+error.svelte")) {
        fileInfos.push({
          filePath: path.join(dir, file),
          fileType: "error",
          resetInfo: null,
        });
      }
    }

    return fileInfos;
  }

  private parseResetInfo(fileName: string): ResetInfo | null {
    const match = fileName.match(/\+page@(.*)\.svelte$/);
    if (!match) {
      return null;
    }

    const resetTarget = match[1] || "root";
    return {
      resetTarget,
      displayName: resetTarget || "root",
      layoutLevel: 0, // This will be calculated based on path depth
    };
  }

  private flattenRoutes(routes: RouteItem[]): RouteItem[] {
    const routeGroups = new Map<string, RouteItem[]>();
    let lastSubDirectory = "";

    const processRoute = (item: RouteItem) => {
      const segments = item.routePath.split("\\");
      const topLevel = segments[0] || "root";

      // Get the subdirectory if it exists (e.g., 'test/about', 'test/blog')
      const subDir = segments.length > 1 ? segments.slice(0, 2).join("/") : "";

      if (!routeGroups.has(topLevel)) {
        routeGroups.set(topLevel, []);
      }

      // Add spacer if we're switching to a new subdirectory
      if (subDir && subDir !== lastSubDirectory && lastSubDirectory !== "") {
        routeGroups
          .get(topLevel)
          ?.push(new RouteItem("", "", "", [], this.port, "spacer"));
      }

      if (subDir) {
        lastSubDirectory = subDir;
      }

      // Add the route with its full path
      routeGroups
        .get(topLevel)
        ?.push(
          new RouteItem(
            item.routePath,
            item.routePath,
            item.filePath,
            [],
            this.port,
            item.routeType,
            false,
            item.resetInfo
          )
        );

      // Process children
      if (item.children.length > 0) {
        item.children.forEach((child) => processRoute(child));
      }
    };

    routes.forEach((route) => processRoute(route));

    // Create final flat list with dividers
    const flatList: RouteItem[] = [];
    const sortedGroups = Array.from(routeGroups.keys()).sort();

    sortedGroups.forEach((section) => {
      // Add section divider
      flatList.push(new RouteItem(section, "", "", [], this.port, "divider"));

      // Add routes for this section
      flatList.push(...(routeGroups.get(section) || []));
    });

    return flatList;
  }

  private compareRoutes(a: string, b: string): number {
    const sortingType = vscode.workspace
      .getConfiguration("svelteRadar")
      .get<"natural" | "basic">("sortingType", "natural");

    // Helper to get route type priority
    const getRoutePriority = (route: string): number => {
      const segment = route.split("/").pop() || "";

      // Check if it's a special parameter first (rest/optional)
      const isSpecial = segment.startsWith("[...") || segment.startsWith("[[");
      if (isSpecial) {
        if (segment.startsWith("[...")) {
          return 0;
        } // rest parameters (lowest)
        if (segment.startsWith("[[")) {
          return 1;
        } // optional parameters
      }

      // Then handle static vs dynamic
      const isDynamic = segment.includes("[");
      if (isDynamic) {
        return 2;
      } // dynamic parameters
      return 3; // static routes (highest)
    };

    // Compare route types first
    const aPriority = getRoutePriority(a);
    const bPriority = getRoutePriority(b);

    if (aPriority !== bPriority) {
      return bPriority - aPriority; // Higher priority comes first
    }

    // For routes of same type, use selected sorting method
    if (sortingType === "natural") {
      return RouteUtils.naturalSort(a, b);
    }

    // Default string comparison
    return a.localeCompare(b);
  }

  private async updateSearchContext(hasSearch: boolean) {
    await vscode.commands.executeCommand(
      "setContext",
      "svelteRadar:hasSearchTerm",
      hasSearch
    );
  }

  async search() {
    const searchInput = await vscode.window.showInputBox({
      prompt: "Search routes",
      placeHolder: "Enter route path or name",
    });

    if (searchInput !== undefined) {
      this.searchPattern = searchInput.toLowerCase();
      await this.updateSearchContext(!!this.searchPattern);
      this.refresh();
    }
  }

  async clearSearch() {
    this.searchPattern = "";
    await this.updateSearchContext(false);
    this.refresh();
  }

  private matchesSearch = (
    route: RouteItem,
    isHierarchical: boolean
  ): boolean => {
    // Normalize paths first
    const normalizedSearch = this.searchPattern
      .toLowerCase()
      .replace(/\/+/g, "/")
      .replace(/\/$/, "");

    const normalizedRoutePath = route.routePath
      .toLowerCase()
      .replace(/\\/g, "/")
      .replace(/\/+/g, "/")
      .replace(/\/$/, "");

    // Split into segments
    const searchSegments = normalizedSearch.split("/").filter(Boolean);
    const routeSegments = normalizedRoutePath.split("/").filter(Boolean);

    // For single segment searches, be more permissive
    if (searchSegments.length === 1) {
      return routeSegments.some((segment) =>
        this.normalizeSegment(segment).includes(searchSegments[0])
      );
    }

    // For multi-segment searches, require continuous matching
    if (searchSegments.length > routeSegments.length) {
      return false;
    }

    // Try to match segments continuously
    for (let i = 0; i <= routeSegments.length - searchSegments.length; i++) {
      const matched = searchSegments.every((searchSeg, j) => {
        const routeSeg = routeSegments[i + j];
        return this.segmentsMatch(searchSeg, routeSeg);
      });
      if (matched) {
        return true;
      }
    }

    return false;
  };

  private normalizeSegment(segment: string): string {
    return segment
      .replace(/^\[\.\.\.(\w+)\]$/, "*$1") // [...param] -> *param
      .replace(/^\[\[(\w+)\]\]$/, ":$1?") // [[param]] -> :param?
      .replace(/^\[(\w+)=\w+\]$/, ":$1") // [param=matcher] -> :param
      .replace(/^\[(\w+)\]$/, ":$1"); // [param] -> :param
  }

  private segmentsMatch(searchSeg: string, routeSeg: string): boolean {
    if (!searchSeg || !routeSeg) {
      return false;
    }

    // Normalize the route segment
    const normalizedRouteSeg = this.normalizeSegment(routeSeg);

    // If search segment starts with ':', treat it as looking for a parameter
    if (searchSeg.startsWith(":")) {
      const searchParamName = searchSeg.slice(1);
      // Match if route segment is any type of parameter
      return routeSeg.startsWith("[");
    }

    // For exact matches
    if (searchSeg === normalizedRouteSeg) {
      return true;
    }

    // For rest parameters
    if (routeSeg.startsWith("[...")) {
      return true;
    }

    // For normal parameters, require exact matches
    if (routeSeg.startsWith("[")) {
      return normalizedRouteSeg === searchSeg;
    }

    // For static segments, require exact matches
    return searchSeg === routeSeg;
  }

  private filterRoutes(routes: RouteItem[]): RouteItem[] {
    if (!this.searchPattern) {
      return routes;
    }

    const filterHierarchical = (route: RouteItem): RouteItem | null => {
      // Always keep root level files and dividers for structure
      if (route.routeType === "divider" || route.routeType === "spacer") {
        return route;
      }

      // Check if current route matches
      const currentMatches = this.matchesSearch(route, true);

      // Filter children recursively
      const filteredChildren = route.children
        .map((child) => filterHierarchical(child))
        .filter((child): child is RouteItem => child !== null);

      // Keep the route if it matches or has matching children
      if (currentMatches || filteredChildren.length > 0) {
        return new RouteItem(
          route.label,
          route.routePath,
          route.filePath,
          filteredChildren,
          this.port,
          route.routeType,
          true,
          route.resetInfo,
          route.fileType
        );
      }

      return null;
    };

    const filterFlat = (): RouteItem[] => {
      const filteredRoutes: RouteItem[] = [];
      let currentGroup: RouteItem | null = null;
      let currentGroupItems: RouteItem[] = [];

      for (const route of routes) {
        if (route.routeType === "divider") {
          if (currentGroup && currentGroupItems.length > 0) {
            filteredRoutes.push(currentGroup);
            filteredRoutes.push(...currentGroupItems);
          }
          currentGroup = route;
          currentGroupItems = [];
        } else if (this.matchesSearch(route, false)) {
          currentGroupItems.push(route);
        }
      }

      // Add the last group if it has items
      if (currentGroup && currentGroupItems.length > 0) {
        filteredRoutes.push(currentGroup);
        filteredRoutes.push(...currentGroupItems);
      }

      return filteredRoutes;
    };

    // Use different filtering strategy based on view type
    if (this.flatView) {
      return filterFlat();
    } else {
      return routes
        .map((route) => filterHierarchical(route))
        .filter((route): route is RouteItem => route !== null);
    }
  }

  /**
   * Opens a route in the editor
   */
  async openRoute(input: string | RouteItem) {
    if (typeof input === "string") {
      let relativePath: string;

      try {
        // Handle both URLs and direct paths
        if (input.includes("://")) {
          const url = new URL(input);
          relativePath = url.pathname;
        } else {
          // Handle paths that might start with / or not
          relativePath = input.startsWith("/") ? input.slice(1) : input;
        }

        // Remove trailing slash if present
        relativePath = relativePath.replace(/\/$/, "");

        // Handle empty path (root route)
        if (!relativePath) {
          relativePath = "/";
        }

        const routeFile = await this.findMatchingRoute(relativePath);

        if (routeFile) {
          const document = await vscode.workspace.openTextDocument(routeFile);
          await vscode.window.showTextDocument(document);
        } else {
          vscode.window.showErrorMessage(
            `No matching route found for: ${input}`
          );
        }
      } catch (error) {
        vscode.window.showErrorMessage(`Invalid route or URL format: ${input}`);
      }
    } else {
      if (input.filePath) {
        const document = await vscode.workspace.openTextDocument(
          input.filePath
        );
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
    if (relativePath === "/" || relativePath === "") {
      return this.findMostSpecificPage(routesDir);
    }

    const segments = relativePath.split("/").filter(Boolean);
    return this.findMatchingSegments(routesDir, segments);
  }

  private async findMatchingSegments(
    currentDir: string,
    segments: string[]
  ): Promise<string | null> {
    if (segments.length === 0) {
      // For optional parameters, we need to look one level deeper even with no segments
      const entries = await fs.promises.readdir(currentDir);
      for (const entry of entries) {
        if (entry.startsWith("[[") && entry.endsWith("]]")) {
          const fullPath = path.join(currentDir, entry);
          const optionalMatch = await this.findMostSpecificPage(fullPath);
          if (optionalMatch) {
            return optionalMatch;
          }
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
      if (!(await fs.promises.stat(fullPath)).isDirectory()) {
        continue;
      }

      const routeType = this.getRouteType(entry);
      let match: string | null = null;
      let score = 0;

      if (routeType === "static" && entry === currentSegment) {
        match = await this.findMatchingSegments(fullPath, segments.slice(1));
        score = 100;
      } else if (routeType === "matcher") {
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
        if (!(await fs.promises.stat(fullPath)).isDirectory()) {
          continue;
        }

        const routeType = this.getRouteType(entry);
        let match: string | null = null;
        let score = 0;

        switch (routeType) {
          case "group":
            match = await this.findMatchingSegments(fullPath, segments);
            if (match) {
              score = 95;
            }
            break;
          case "dynamic":
            match = await this.findMatchingSegments(
              fullPath,
              segments.slice(1)
            );
            score = 80;
            break;
          case "optional":
            match = await this.findMatchingSegments(
              fullPath,
              segments.slice(1)
            );
            if (match) {
              score = 70;
            } else {
              match = await this.findMatchingSegments(fullPath, segments);
              if (match) {
                score = 60;
              }
            }
            break;
          case "rest":
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
    if (!fs.existsSync(dir)) {
      return null;
    }

    const files = fs.readdirSync(dir);

    // Check for all possible page/server files
    const filePriorities = [
      (f: string) => f.match(/\+page@\([^)]+\)\.svelte$/), // Layout reset with target
      (f: string) => f === "+page@.svelte", // Root layout reset
      (f: string) => f === "+server.js", // Server route
      (f: string) => f === "+page.svelte", // Regular page
    ];

    for (const checkPriority of filePriorities) {
      const matchingFile = files.find(checkPriority);
      if (matchingFile) {
        return path.join(dir, matchingFile);
      }
    }

    return null;
  }

  private isParameterMatchGeneric(
    value: string,
    paramPattern: string
  ): boolean {
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
      date: /^\d{4}-\d{2}-\d{2}$/,
    };

    return patterns[matcher] ? patterns[matcher].test(value) : true;
  }

  private getRouteType(entry: string): RouteType {
    if (entry.startsWith("(") && entry.endsWith(")")) {
      return "group";
    }
    if (!entry.includes("[")) {
      return "static";
    }
    if (entry.startsWith("[[") && entry.endsWith("]]")) {
      return "optional";
    }
    if (entry.startsWith("[...")) {
      return "rest";
    }
    if (entry.includes("[") && entry.includes("=")) {
      return "matcher";
    }
    return "dynamic";
  }

  /**
   * Opens a route in the browser
   */
  openInBrowser(route: RouteItem) {
    if (route.routePath) {
      const url = `http://localhost:${this.port}${route.routePath.replace(
        /\\/g,
        "/"
      )}`;
      vscode.env.openExternal(vscode.Uri.parse(url));
    }
  }
}
