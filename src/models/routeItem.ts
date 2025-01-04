import * as vscode from 'vscode';
import { ResetInfo, RouteType } from '../constant/type';

export class RouteItem extends vscode.TreeItem {
    constructor(
        public label: string,
        public readonly routePath: string,
        public readonly filePath: string,
        public children: RouteItem[],
        private port: number,
        public routeType: RouteType,
        public isHierarchical: boolean = false,
        public resetInfo: ResetInfo | null = null
    ) {
        super(
            label,
            isHierarchical && children.length > 0
                ? vscode.TreeItemCollapsibleState.Collapsed
                : vscode.TreeItemCollapsibleState.None
        );

        // Format the label and description
        if (routeType === 'divider') {
            this.label = this.formatDividerLabel(label);
            this.description = '';
            this.contextValue = 'divider';
            this.tooltip = '';
            this.command = undefined;
            this.iconPath = undefined;
        } else {
            this.label = this.formatDisplayPath(label);
            this.description = this.formatDescription();

            // Set icon and color
            let icon = 'file';
            let color = 'charts.green';

            switch (routeType) {
                case 'error':
                    icon = 'error';
                    color = 'errorForeground';
                    break;
                case 'dynamic':
                    icon = 'symbol-variable';
                    color = 'charts.blue';
                    break;
                case 'layout':
                    icon = 'layout';
                    color = 'charts.purple';
                    break;
                case 'group':
                    icon = 'folder-library';
                    color = 'charts.orange';
                    break;
                case 'optional':
                    icon = 'symbol-key';
                    color = 'charts.yellow';
                    break;
                case 'rest':
                    icon = 'symbol-variable';
                    color = 'charts.blue';
                    break;
                default:
            }

            // ignoring the private constructor error here
            // @ts-ignore
            this.iconPath = new vscode.ThemeIcon(icon, new vscode.ThemeColor(color));

            this.command = {
                command: 'svelteRadar.openFile',
                title: 'Open File',
                arguments: [this]
            };
        }

        // Enhanced tooltip
        this.tooltip = this.getTooltipContent(routePath, routeType, resetInfo, filePath);
    }

    private isGroupRoute(): boolean {
        return this.routePath.includes('(') && this.routePath.includes(')');
    }

    private getTooltipContent(routePath: string, routeType: string, resetInfo: any, filePath: string): string {
        return [
            `Path: ${routePath}`,
            `Type: ${routeType}`,
            resetInfo ? `Resets to: ${resetInfo.displayName} layout` : '',
            filePath ? `File: ${filePath}` : '',
            this.isGroupRoute() ? 'Group Route' : ''
        ].filter(Boolean).join('\n');
    }

    private formatDisplayPath(path: string): string {
        // For root level groups, we don't modify the path since it will be shown in divider
        if (this.routeType === 'divider') {
            return path;
        }

        // Clean up the path similar to the browser URL formatting
        let cleanPath = path
            .replace(/\\/g, '/')                // Normalize slashes
            .replace(/^\([^)]+\)\//, '')     // Remove root level group
            .replace(/\/\([^)]+\)\//g, '/');  // Remove nested groups

        return cleanPath
            .replace(/\[\.\.\.(\w+(?:-\w+)*)\]/g, '*$1') // [...param] -> *param
            .replace(/\[\[(\w+(?:-\w+)*)\]\]/g, ':$1?')  // [[param]] -> :param?
            .replace(/\[(\w+(?:-\w+)*)=\w+\]/g, ':$1')   // [param=matcher] -> :param
            .replace(/\[(\w+(?:-\w+)*)\]/g, ':$1');      // [param] -> :param
    }

    private formatDescription(): string {
        const parts: string[] = [];
    
        // Map route types to more user-friendly terms
        const typeMap: { [key in RouteType]: string } = {
            static: 'page',
            dynamic: 'slug',
            rest: 'catch-all',
            optional: 'optional',
            error: 'error',
            layout: 'layout',
            group: 'group',
            divider: '',
            matcher: 'matcher'
        };
    
        // Add page type
        if (this.routeType !== 'divider') {
            // Check if path contains multiple parameter types
            const hasMultipleTypes = (this.routePath?.match(/\[[^\]]+\]/g) ?? []).length > 1;
            const displayType = hasMultipleTypes ? 'dynamic' : typeMap[this.routeType];
            parts.push(`[${displayType}]`);
        }
    
        // Add group info if it's inside a group
        const groupMatch = this.routePath.match(/\(([^)]+)\)/);
        if (groupMatch && !this.routePath.startsWith('(')) {
            parts.push(`[${groupMatch[1]} group]`);
        }
    
        // Add matcher info if present
        const matcherMatch = this.routePath.match(/\[(\w+)=(\w+)\]/);
        if (matcherMatch) {
            parts.push(`[matches ${matcherMatch[2]}]`);
        }
    
        // Add reset info if present
        if (this.resetInfo) {
            parts.push(`[resets to ${this.resetInfo.displayName.replace(/[()]/g, '')}]`);
        }
    
        return parts.join(' ');
    }

    private formatDividerLabel(label: string): string {
        // Check if it's a root level group
        if (label.startsWith('(') && label.endsWith(')')) {
            const groupName = label.slice(1, -1);
            return `─────── ${groupName} (group) ───────`;
        }
        return `─────── ${label} ───────`;
    }
}