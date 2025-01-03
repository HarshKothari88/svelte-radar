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

        // Set specific icons and colors for different route types
        let icon = 'file';
        let color = 'charts.green'; // Default color for static routes
        switch (routeType) {
            case 'divider':
                this.description = '';
                this.label = `─────── ${label} ───────`;
                this.contextValue = 'divider';
                this.tooltip = '';
                break;
            case 'error':
                icon = 'error';
                color = 'errorForeground';
                this.description = '[error]';
                break;
            case 'dynamic':
                icon = 'symbol-variable';
                color = 'charts.blue';
                this.description = '[dynamic]';
                break;
            case 'layout':
                icon = 'layout';
                color = 'charts.purple';
                this.description = '[layout]';
                break;
            case 'group':
                icon = 'folder-library';
                color = 'charts.orange';
                this.description = '[group]';
                break;
            case 'optional':
                icon = 'symbol-key';
                color = 'charts.yellow';
                this.description = '[optional]';
                break;
            case 'rest':
                icon = 'symbol-variable';
                color = 'charts.blue';
                this.description = '[rest]';
                break;
            default:
                this.description = '[page]';
        }

        // ignoring the private constructor error here
        // @ts-ignore
        this.iconPath = new vscode.ThemeIcon(icon, new vscode.ThemeColor(color));

        // Don't add command handlers for dividers
        if (routeType !== 'divider') {
            this.command = {
                command: 'svelteRadar.openFile',
                title: 'Open File',
                arguments: [this]
            };
        }

        if (routeType === 'divider') {
            this.label = label;  // Keep the divider text as is
            this.description = undefined;  // No description for dividers
            this.contextValue = 'divider';
            this.command = undefined;  // No click handler for dividers
            this.iconPath = undefined;  // No icon for dividers
            this.tooltip = '';
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
}