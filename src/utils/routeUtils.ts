import * as path from 'path';
import * as fs from 'fs';
import * as vscode from 'vscode';

export class RouteUtils {
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

    static naturalSort(a: string, b: string): number {
        // Helper function to convert string into sortable parts
        // It splits the string into chunks of text and numbers
        const splitIntoPartsWithNumbers = (str: string) => {
            return str.split(/(\d+)/).map(part => {
                // Convert number strings to actual numbers for proper comparison
                const num = parseInt(part);
                return isNaN(num) ? part : num;
            });
        };
    
        // Split both paths into their components
        const partsA = splitIntoPartsWithNumbers(a);
        const partsB = splitIntoPartsWithNumbers(b);
    
        // Compare each part
        for (let i = 0; i < Math.min(partsA.length, partsB.length); i++) {
            if (partsA[i] !== partsB[i]) {
                // If both parts are numbers, do numeric comparison
                if (typeof partsA[i] === 'number' && typeof partsB[i] === 'number') {
                    return (partsA[i] as number) - (partsB[i] as number);
                }
                // Otherwise do string comparison
                return String(partsA[i]).localeCompare(String(partsB[i]));
            }
        }
        
        // If all parts match up to this point, shorter string comes first
        return partsA.length - partsB.length;
    }
}