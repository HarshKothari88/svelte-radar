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

suite('Route Sorting Test Suite', () => {
    let routesProvider: RoutesProvider;
    let workspaceDir: string;

    suiteSetup(async () => {
        workspaceDir = path.resolve(__dirname, '../../test-fixtures');
        routesProvider = new RoutesProvider(workspaceDir);
    });

    test('Default sorting should maintain standard string order', async () => {
        // Set sorting to default
        await vscode.workspace.getConfiguration('svelteRadar').update('sortingType', 'default', true);
        
        const testRoutes = [
            'blog/1-first',
            'blog/10-tenth',
            'blog/2-second',
            'blog/20-twentieth'
        ];

        // Sort using the provider's compareRoutes method
        const sorted = testRoutes.sort((a, b) => routesProvider['compareRoutes'](a, b));
        
        // In default sorting, string comparison means 10 comes before 2
        assert.deepStrictEqual(sorted, [
            'blog/1-first',
            'blog/10-tenth',
            'blog/2-second',
            'blog/20-twentieth'
        ]);
    });

    test('Natural sorting should order numbers correctly', async () => {
        // Set sorting to natural
        await vscode.workspace.getConfiguration('svelteRadar').update('sortingType', 'natural', true);
        
        const testRoutes = [
            'blog/1-first',
            'blog/10-tenth',
            'blog/2-second',
            'blog/20-twentieth'
        ];

        // Sort using the provider's compareRoutes method
        const sorted = testRoutes.sort((a, b) => routesProvider['compareRoutes'](a, b));
        
        // In natural sorting, numbers should be ordered naturally
        assert.deepStrictEqual(sorted, [
            'blog/1-first',
            'blog/2-second',
            'blog/10-tenth',
            'blog/20-twentieth'
        ]);
    });

    test('Route type priorities should be maintained with natural sorting', async () => {
        // Set sorting to natural
        await vscode.workspace.getConfiguration('svelteRadar').update('sortingType', 'natural', true);
        
        const testRoutes = [
            'blog/1-first',
            'blog/[slug]',
            'blog/2-second', 
            'blog/[...rest]',
            'blog/10-tenth',
            'blog/[[optional]]'
        ];
    
        // Sort using the provider's compareRoutes method
        const sorted = testRoutes.sort((a, b) => routesProvider['compareRoutes'](a, b));
        
        // Static routes first, then dynamic, then optional, then rest
        assert.deepStrictEqual(sorted, [
            'blog/1-first',
            'blog/2-second',
            'blog/10-tenth',
            'blog/[slug]',
            'blog/[[optional]]',
            'blog/[...rest]'
        ]);
    });

    test('Natural sorting should handle numbers anywhere in path', async () => {
        await vscode.workspace.getConfiguration('svelteRadar').update('sortingType', 'natural', true);
        
        const testRoutes = [
            'item10',
            'item1',
            'item2',
            'path/to/page1/section10',
            'path/to/page1/section2',
            'article-1-draft',
            'article-10-final',
            'article-2-review',
            'section5-part10',
            'section5-part2',
            'xyz10abc20',
            'xyz2abc10',
            'xyz10abc10',
            '1article',
            '10article',
            '2article'
        ];
    
        const sorted = testRoutes.sort((a, b) => routesProvider['compareRoutes'](a, b));
        
        assert.deepStrictEqual(sorted, [
            '1article',
            '2article',
            '10article',
            'article-1-draft',
            'article-2-review',
            'article-10-final',
            'item1',
            'item2',
            'item10',
            'path/to/page1/section2',
            'path/to/page1/section10',
            'section5-part2',
            'section5-part10',
            'xyz2abc10',
            'xyz10abc10',
            'xyz10abc20'
        ]);
    });
});