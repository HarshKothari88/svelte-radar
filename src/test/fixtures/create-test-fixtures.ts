import * as fs from 'fs-extra';
import * as path from 'path';

/**
 * Creates test fixture files for SvelteKit routing tests
 */
export async function createTestFixtures() {
    // Here's the issue - we need to go up three levels from __dirname
    const projectRoot = path.resolve(__dirname, '../../../');
    const fixturesDir = path.join(projectRoot, 'test-fixtures');
    const routesDir = path.join(fixturesDir, 'src', 'routes');

    console.log('__dirname:', __dirname);
    console.log('projectRoot:', projectRoot);
    console.log('fixturesDir:', fixturesDir);
    console.log('routesDir:', routesDir);

    console.log('Creating test fixtures at:', fixturesDir);

    try {
        // Clean and recreate directories
        console.log('Cleaning existing fixtures...');
        if (await fs.pathExists(fixturesDir)) {
            await fs.remove(fixturesDir);
        }

        console.log('Creating base directories...');
        await fs.ensureDir(routesDir);

        // Helper function to create a file and log it
        async function createFile(filePath: string, content: string = '') {
            const fullPath = path.join(routesDir, filePath);
            await fs.ensureDir(path.dirname(fullPath));
            await fs.writeFile(fullPath, content);
            console.log('Created file:', fullPath);
        }

        // Helper function to create a directory and log it
        async function createDir(dirPath: string) {
            const fullPath = path.join(routesDir, dirPath);
            await fs.ensureDir(fullPath);
            console.log('Created directory:', fullPath);
        }

        console.log('Creating route files...');

        // Root files
        await createFile('+page.svelte');
        await createFile('+layout.svelte');
        await createFile('+error.svelte');

        // About section
        await createDir('about');
        await createFile('about/+page.svelte');
        await createDir('about/team');
        await createFile('about/team/+page.svelte');
        await createFile('about/team/+layout.svelte');
        await createDir('about/[slug]');
        await createFile('about/[slug]/+page.svelte');

        // API endpoints
        await createDir('api');
        await createFile('api/posts/+server.js');
        await createFile('api/comments/[id]/+server.js');

        // Blog with dynamic routes
        await createDir('blog');
        await createFile('blog/+layout.svelte');
        await createDir('blog/[slug]');
        await createFile('blog/[slug]/+page.svelte');
        await createDir('blog/category/[...slug]');
        await createFile('blog/category/[...slug]/+page.svelte');

        // Authentication group routes
        await createDir('(auth)');
        await createFile('(auth)/login/+page.svelte');
        await createFile('(auth)/register/+page.svelte');

        // Docs with optional parameters
        await createDir('docs');
        await createFile('docs/+layout.svelte');
        await createDir('docs/[[lang]]');
        await createFile('docs/[[lang]]/+page.svelte');
        await createFile('docs/[[lang]]/+layout.svelte');

        // Dashboard with layout resets
        await createDir('dashboard');
        await createFile('dashboard/+layout.svelte');
        await createFile('dashboard/+page@.svelte');
        await createDir('dashboard/(admin)');
        await createFile('dashboard/(admin)/settings/+page@(auth).svelte');

        // Products with parameter matchers
        await createDir('products');
        await createFile('products/+layout.svelte');
        await createDir('products/[id=integer]');
        await createFile('products/[id=integer]/+page.svelte');
        await createDir('products/[slug]');
        await createFile('products/[slug]/+page.svelte');

        // Natural sorting test
        await createDir('blog');
        await createFile('blog/+layout.svelte');
        await createFile('blog/1-first/+page.svelte');
        await createFile('blog/2-second/+page.svelte');
        await createFile('blog/10-tenth/+page.svelte');
        await createFile('blog/[slug]/+page.svelte');
        await createFile('blog/[[optional]]/+page.svelte');
        await createFile('blog/[...rest]/+page.svelte');


        console.log('Test fixtures created successfully!');
        console.log('Fixtures location:', fixturesDir);
    } catch (error) {
        console.error('Error creating test fixtures:', error);
        throw error;
    }
}

// Run the script
createTestFixtures().catch(error => {
    console.error('Failed to create test fixtures:', error);
    process.exit(1);
});