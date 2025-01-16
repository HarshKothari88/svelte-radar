export type RouteType = 'static' | 'dynamic' | 'rest' | 'optional' | 'error' | 'layout' | 'divider' | 'group' | 'matcher';

export type FileType = 'page' | 'server' | 'layout' | 'error' | 'pageServer' | 'layoutServer' | 'pageClient' | 'layoutClient';

export interface RouteColors {
    static: string;
    dynamic: string;
    error: string;
    layout: string;
    divider: string;
}

export interface ResetInfo {
    resetTarget: string;  // The target layout to reset to
    displayName: string;  // How to display this in the UI
    layoutLevel: number;  // How many levels up to go
}

export interface RouteMatch {
    nextPath: string;
    remainingSegments: string[];
    score: number;
}

export interface SegmentMatch {
    remainingSegments: string[];
    score: number;
}

export interface RouteFileInfo {
    filePath: string;
    fileType: FileType;
    resetInfo: ResetInfo | null;
}