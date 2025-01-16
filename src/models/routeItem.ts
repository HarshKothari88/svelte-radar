import * as vscode from 'vscode';
import { FileType, ResetInfo, RouteType } from '../constant/type';
import { basename } from 'path';

export class RouteItem extends vscode.TreeItem {
    constructor(
        public label: string,
        public readonly routePath: string,
        public readonly filePath: string,
        public children: RouteItem[],
        private port: number,
        public routeType: RouteType,
        public isHierarchical: boolean = false,
        public resetInfo: ResetInfo | null = null,
        public fileType: FileType = 'page',
    ) {
        super(
            label,
            isHierarchical && children.length > 0
                ? vscode.TreeItemCollapsibleState.Collapsed
                : vscode.TreeItemCollapsibleState.None
        );

        // Format the label and description
        if (routeType === 'divider' || routeType === 'spacer') {
            this.label = this.formatSpecialLabel(label, routeType);
            this.description = '';
            this.contextValue = 'divider';
            this.tooltip = '';
            this.command = undefined;
            this.iconPath = undefined;
        } else {
            this.description = this.formatDescription();
            this.label = isHierarchical ? label : this.formatDisplayPath(label);

            // Set icon and color
            let icon = 'file';
            let color = 'charts.green';

            // First determine base icon and color from route type
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
                    icon = 'question';
                    color = 'charts.yellow';
                    break;
                case 'rest':
                    icon = 'symbol-variable';
                    color = 'charts.blue';
                    break;
                default:
            }

            const fileName = basename(filePath);
            if (fileName) {
                if (fileName.includes('+server.')) {
                    icon = 'server-process';
                    color = 'charts.orange';
                } else if (fileName.includes('.server.')) {
                    icon = 'server';
                    color = 'charts.yellow';      // server-side files get yellow
                } else if (fileName.includes('.ts') && !fileName.includes('.server.')) {
                    icon = 'vm';
                    color = 'charts.blue';        // client-side TS files get blue
                } else if (fileName.includes('+layout.')) {
                    icon = 'layout';
                    color = 'charts.purple';
                } else if (fileName.includes('+error.')) {
                    icon = 'error';
                    color = 'errorForeground';
                }
                // Regular page files will keep their route type colors
            }

            // ignoring the private constructor error here
            // @ts-ignore
            this.iconPath = new vscode.ThemeIcon(icon, new vscode.ThemeColor(color));
            // ignoring the private constructor error here
            // @ts-ignore
            this.iconPath = new vscode.ThemeIcon(icon, new vscode.ThemeColor(color));

            this.command = {
                command: 'svelteRadar.openFile',
                title: 'Open File',
                arguments: [this]
            };

            // Enhanced tooltip
            this.tooltip = this.getTooltipContent(routePath, routeType, resetInfo, filePath, fileType);
        }
    }

    private isGroupRoute(): boolean {
        return this.routePath.includes('(') && this.routePath.includes(')');
    }

    private getTooltipContent(routePath: string, routeType: string, resetInfo: any, filePath: string, fileType: string): string {
        return [
            `Path: ${routePath}`,
            `Type: ${routeType}`,
            resetInfo ? `Resets to: ${resetInfo.displayName} layout` : '',
            filePath ? `File: ${filePath}` : '',
            fileType ? `Type: ${fileType}` : '',
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
            matcher: 'matcher',
            spacer: ''
        };

        // Determine file type based on filename first
        const fileName = this.filePath ? basename(this.filePath) : '';

        // Add route type only for actual pages (not for layouts, servers, etc)
        if (this.routeType !== 'divider' &&
            (!fileName.includes('+layout.') &&
                !fileName.includes('+server.'))) {
            const hasMultipleTypes = (this.routePath?.match(/\[[^\]]+\]/g) ?? []).length > 1;
            const displayType = hasMultipleTypes ? 'dynamic' : typeMap[this.routeType];
            parts.push(`[${displayType}]`);
        }

        // Add file type indicators
        if (fileName) {
            if (fileName.includes('+server.')) {
                parts.push('[api]');
            } else if (fileName.includes('+page.server.') || fileName.includes('+layout.server.')) {
                parts.push('[server]');
            } else if (fileName.includes('+error.')) {
                parts.push('[error]');
            } else if (fileName.includes('+layout.ts') || fileName.includes('+page.ts')) {
                parts.push('[client]');
            } else if (fileName.includes('+layout.')) {
                parts.push('[layout]');
            }
        }

        // Add group info if it's inside a group
        const groupMatch = this.routePath.match(/\(([^)]+)\)/);
        if (groupMatch && !this.routePath.startsWith('(')) {
            parts.push(`[${groupMatch[1]}]`);
        }

        // Add matcher info if present
        const matcherMatch = this.routePath.match(/\[(\w+)=(\w+)\]/);
        if (matcherMatch) {
            parts.push(`[${matcherMatch[2]}]`);
        }

        // Add reset info if present
        if (this.resetInfo) {
            parts.push(`[resets to ${this.resetInfo.displayName.replace(/[()]/g, '')}]`);
        }

        return parts.join(' ');
    }

    private formatSpecialLabel(label: string, type: RouteType): string {
        console.log('formatSpecialLabel', label, type);
        if (type === 'spacer') {
            return '---------------'; // Simple spacer line
        }

        // For dividers (directory or group headers)
        if (label.startsWith('(') && label.endsWith(')')) {
            const groupName = label.slice(1, -1);
            return `───── ${groupName} (group) ─────`;
        }
        return `───── ${label === '/' ? 'root' : label} ─────`;
    }
}