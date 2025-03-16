import * as vscode from 'vscode';

export enum ContentItemType {
    SectionJS = 'sectionJS',
    SectionHTML = 'sectionHTML',
    Component = 'component',
    ComponentInstance = 'componentInstance',
    Message = 'message'
}

export class PageContentItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly type: ContentItemType,
        public readonly filePath: string,
        public readonly line: number,
        public readonly componentFilePath?: string,
        public readonly instances?: { line: number, index: number }[],
        public readonly currentInstanceIndex: number = 0
    ) {
        super(
            label,
            type === ContentItemType.Component && instances && instances.length > 1
                ? vscode.TreeItemCollapsibleState.Collapsed
                : vscode.TreeItemCollapsibleState.None
        );

        this.contextValue = type;

        // Set icon and style based on type
        if (type === ContentItemType.Message) {
            this.tooltip = label;
            this.contextValue = 'message';
            this.iconPath = new vscode.ThemeIcon('info');
            return;
        }

        if (type === ContentItemType.ComponentInstance) {
            // For component instances, show the instance number
            this.label = `Instance #${currentInstanceIndex + 1} (Line ${line})`;
            this.contextValue = componentFilePath ? 'componentInstanceWithFile' : 'componentInstance';
            this.iconPath = new vscode.ThemeIcon('symbol-value', new vscode.ThemeColor('charts.blue'));
            
            // Set command to navigate to this instance
            this.command = {
                command: 'svelteRadar.scrollToLine',
                title: 'Scroll to Component Instance',
                arguments: [filePath, line]
            };
            return;
        }

        // Set icon based on type
        let icon, color;
        
        if (type === ContentItemType.SectionJS) {
            icon = 'symbol-function';
            color = 'charts.yellow';
            this.description = 'JS Section';
        } else if (type === ContentItemType.SectionHTML) {
            icon = 'bookmark';
            color = 'charts.purple';
            this.description = 'Section';
        } else { // Component
            icon = 'symbol-class';
            color = 'charts.green';
        }

        // Set icon color based on content type
        this.iconPath = new vscode.ThemeIcon(icon, new vscode.ThemeColor(color));

        // Set tooltip
        if (type === ContentItemType.Component && instances && instances.length > 0) {
            this.tooltip = `Component: ${label}\nInstances: ${instances.length}${componentFilePath ? '\nComponent File: ' + componentFilePath : ''}`;
        } else if (type === ContentItemType.SectionJS) {
            this.tooltip = `JS Section: ${label} (Line ${line})`;
        } else if (type === ContentItemType.SectionHTML) {
            this.tooltip = `HTML Section: ${label} (Line ${line})`;
        } else {
            this.tooltip = `Component: ${label} (Line ${line})${componentFilePath ? '\nComponent File: ' + componentFilePath : ''}`;
        }

        // Set description based on type
        if (type === ContentItemType.Component && instances && instances.length > 1) {
            this.description = `${instances.length} instances${componentFilePath ? ' (File Available)' : ''}`;
        } else if (type === ContentItemType.Component) {
            this.description = componentFilePath ? 'Component (File Available)' : 'Component';
        }

        // Set command for direct click action
        if (type === ContentItemType.Component && instances && instances.length > 1) {
            // For multi-instance components, clicking expands the tree
            this.command = undefined;
        } else {
            // For sections or single-instance components, navigate directly
            this.command = {
                command: 'svelteRadar.scrollToLine',
                title: 'Scroll to Component Usage',
                arguments: [filePath, line]
            };
        }

        // Special context values
        if (type === ContentItemType.Component && componentFilePath) {
            this.contextValue = instances && instances.length > 1 
                ? 'componentMultiWithFile' 
                : 'componentWithFile';
        } else if (type === ContentItemType.Component) {
            this.contextValue = instances && instances.length > 1 
                ? 'componentMulti' 
                : 'component';
        }
    }
} 