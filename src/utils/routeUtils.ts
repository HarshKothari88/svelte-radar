import * as path from 'path';
import * as fs from 'fs';
import * as vscode from 'vscode';

export class RouteUtils {
    static detectPort(rootPath: string): number {
        const configFiles = ['svelte.config.js', 'vite.config.js', 'vite.config.ts'];

        for (const configFile of configFiles) {
            const configPath = path.join(rootPath, configFile);
            if (fs.existsSync(configPath)) {
                try {
                    const content = fs.readFileSync(configPath, 'utf-8');
                    const portMatch = content.match(/port:\s*(\d+)/);
                    if (portMatch) {
                        return parseInt(portMatch[1], 10);
                    }
                } catch (error) {
                    console.error(`Error reading config file: ${error}`);
                }
            }
        }

        return vscode.workspace.getConfiguration('svelteRadar').get('devServerPort', 5173);
    }

    /**
     * Decodes SvelteKit route path encodings
     */
    static decodeRoutePath(path: string): string {
        // Handle hex encodings like [x+3a] for ':'
        path = path.replace(/\[x\+([0-9a-f]{2})\]/g, (_, hex) =>
            String.fromCharCode(parseInt(hex, 16))
        );

        // Handle Unicode encodings like [u+1f600] for emoji
        path = path.replace(/\[u\+([0-9a-f]{4,5})\]/g, (_, hex) =>
            String.fromCodePoint(parseInt(hex, 16))
        );

        return path;
    }

    /**
    * Normalizes route path for display
    */
    static normalizeRouteName(name: string): string {
        // Handle rest parameters [...rest]
        if (name.startsWith('[...')) {
            return name; // Keep rest parameters as is
        }
        if (name.startsWith('[[')) {
            return name; // Keep optional parameters as is
        }
        if (name.includes('=')) {
            return name; // Keep matcher parameters as is
        }

        // Handle regular parameters [param]
        if (name.startsWith('[') && name.endsWith(']')) {
            return `:${name.slice(1, -1)}`;
        }

        // Handle groups (group)
        if (name.startsWith('(') && name.endsWith(')')) {
            return name;
        }

        return name;
    }

    static formatRouteName(name: string): string {
        if (name.startsWith('[...') && name.endsWith(']')) { return '/*'; }
        if (name.startsWith('[') && name.endsWith(']?')) { return name.slice(1, -2); }
        if (name.startsWith('[') && name.endsWith(']')) { return `:${name.slice(1, -1)}`; }
        return name;
    }
}