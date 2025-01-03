export type RouteType = 'static' | 'dynamic' | 'rest' | 'optional' | 'error' | 'layout' | 'divider' | 'group';

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