import * as assert from 'assert';
import * as path from 'path';
import * as vscode from 'vscode';
import { RoutesProvider } from '../providers/routesProvider';

suite('Route Matching Test Suite', () => {
    let routesProvider: RoutesProvider;
    let workspaceDir: string;

    suiteSetup(async () => {
        workspaceDir = path.resolve(__dirname, '../../test-fixtures');
        routesProvider = new RoutesProvider(workspaceDir);
    });

    function normalizePath(filePath: string): string {
        return filePath?.replace(/\\/g, '/');
    }

    function getExpectedPath(relativePath: string): string {
        return normalizePath(path.join(workspaceDir, 'src/routes', relativePath));
    }

    suite('Static Routes', () => {
        test('Root path should match root page', async () => {
            const result = await routesProvider.findMatchingRoute('/');
            assert.strictEqual(
                normalizePath(result!),
                getExpectedPath('+page.svelte')
            );
        });

        test('Static nested route should match exact path', async () => {
            const result = await routesProvider.findMatchingRoute('/about/team');
            assert.strictEqual(
                normalizePath(result!),
                getExpectedPath('about/team/+page.svelte')
            );
        });
    });

    suite('Dynamic Parameters', () => {
        test('Should match dynamic parameter', async () => {
            const result = await routesProvider.findMatchingRoute('/about/test-slug');
            assert.strictEqual(
                normalizePath(result!),
                getExpectedPath('about/[slug]/+page.svelte')
            );
        });
    });

    suite('Optional Parameters', () => {
        test('Should match path without optional parameter', async () => {
            const result = await routesProvider.findMatchingRoute('/docs');
            assert.strictEqual(
                normalizePath(result!),
                getExpectedPath('docs/[[lang]]/+page.svelte')
            );
        });

        test('Should match path with optional parameter', async () => {
            const result = await routesProvider.findMatchingRoute('/docs/en');
            assert.strictEqual(
                normalizePath(result!),
                getExpectedPath('docs/[[lang]]/+page.svelte')
            );
        });
    });

    suite('Rest Parameters', () => {
        test('Should match rest parameter with multiple segments', async () => {
            const result = await routesProvider.findMatchingRoute('/blog/category/tech/web/sveltekit');
            assert.strictEqual(
                normalizePath(result!),
                getExpectedPath('blog/category/[...slug]/+page.svelte')
            );
        });
    });

    suite('Group Routes', () => {
        test('Should match route inside auth group', async () => {
            const result = await routesProvider.findMatchingRoute('/login');
            assert.strictEqual(
                normalizePath(result!),
                getExpectedPath('(auth)/login/+page.svelte')
            );
        });

        test('Should match route inside admin group', async () => {
            const result = await routesProvider.findMatchingRoute('/dashboard/settings');
            assert.strictEqual(
                normalizePath(result!),
                getExpectedPath('dashboard/(admin)/settings/+page@(auth).svelte')
            );
        });
    });

    suite('Layout Reset Routes', () => {
        test('Should match route that resets to root layout', async () => {
            const result = await routesProvider.findMatchingRoute('/dashboard');
            assert.strictEqual(
                normalizePath(result!),
                getExpectedPath('dashboard/+page@.svelte')
            );
        });

        test('Should match custom layout reset route', async () => {
            const result = await routesProvider.findMatchingRoute('/dashboard/settings');
            assert.strictEqual(
                normalizePath(result!),
                getExpectedPath('dashboard/(admin)/settings/+page@(auth).svelte')
            );
        });
    });

    suite('Route Precedence', () => {
        test('Static route should take precedence over dynamic route', async () => {
            const result = await routesProvider.findMatchingRoute('/about/team');
            assert.strictEqual(
                normalizePath(result!),
                getExpectedPath('about/team/+page.svelte')
            );
        });

        test('Dynamic route should take precedence over rest parameter', async () => {
            const result = await routesProvider.findMatchingRoute('/blog/my-post');
            assert.strictEqual(
                normalizePath(result!),
                getExpectedPath('blog/[slug]/+page.svelte')
            );
        });
    });

    suite('Parameter Matchers', () => {
        test('Should match integer matcher with valid number', async () => {
            const result = await routesProvider.findMatchingRoute('/products/123');
            assert.strictEqual(
                normalizePath(result!),
                getExpectedPath('products/[id=integer]/+page.svelte')
            );
        });
    
        test('Should not match integer matcher with invalid input', async () => {
            const result = await routesProvider.findMatchingRoute('/products/abc');
            assert.strictEqual(
                normalizePath(result!),
                getExpectedPath('products/[slug]/+page.svelte')
            );
        });
    });

    suite('Edge Cases', () => {
        test('Should handle empty path segments', async () => {
            const result = await routesProvider.findMatchingRoute('///about///team///');
            assert.strictEqual(
                normalizePath(result!),
                getExpectedPath('about/team/+page.svelte')
            );
        });

        test('Should handle non-existent routes', async () => {
            const result = await routesProvider.findMatchingRoute('/non/existent/route');
            assert.strictEqual(result, null);
        });

        test('Should handle parameter matcher paths', async () => {
            const result = await routesProvider.findMatchingRoute('/products/123');
            assert.strictEqual(
                normalizePath(result!),
                getExpectedPath('products/[id=integer]/+page.svelte')
            );
        });
    });
});