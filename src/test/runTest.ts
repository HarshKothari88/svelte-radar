import * as path from 'path';
import { runTests } from '@vscode/test-electron';

async function main() {
    try {
        // The folder containing the Extension Manifest package.json
        const extensionDirName = path.resolve(__dirname, '../../');

        // The path to the extension test script
        const testRunnerPath = path.resolve(__dirname, './index');

        // Download VS Code, unzip it and run the integration test
        await runTests({
            extensionDevelopmentPath: extensionDirName,
            extensionTestsPath: testRunnerPath,
            launchArgs: ['--disable-extensions']
        });
    } catch (err) {
        console.error('Failed to run tests:', err);
        process.exit(1);
    }
}

main();