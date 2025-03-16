![svelte_radar_icon](https://github.com/user-attachments/assets/d3a53754-60ce-4c3c-8f1b-770e8f64cfb9)

# Svelte Radar

[![VSCode Marketplace](https://img.shields.io/visual-studio-marketplace/v/HarshKothari.svelte-radar.svg)](https://marketplace.visualstudio.com/items?itemName=HarshKothari.svelte-radar)

[Install from VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=HarshKothari.svelte-radar)

Svelte Radar is a Visual Studio Code extension designed to streamline your SvelteKit development experience. It provides a visual overview of your project's routing structure, helping you navigate complex route hierarchies with ease.

## Features

- **Complete Route Detection**: Automatically detects and displays all SvelteKit route files:

  - Pages (+page.svelte)
  - Server-side logic (+page.server.ts/js)
  - API endpoints (+server.ts/js)
  - Layouts (+layout.svelte)
  - Client-side logic (+layout.ts/js, +page.ts/js)
  - Server layouts (+layout.server.ts/js)
  - Error pages (+error.svelte)
  - Group layouts (+page@.svelte)

- **[NEW] Page Content Navigator**: Quickly navigate within Svelte files:
  - Tagged sections for easy navigation
  - Automatic component detection
  - Direct navigation to component definitions
  - Component instance grouping
  - [View Example](./examples/PageContentExample.svelte)

- **Smart Route Organization**:

  - Hierarchical view for structured navigation
  - Flat view with intelligent grouping
  - Sub-directory dividers for better organization
  - Natural route sorting (handles numbered routes intelligently)
  - Active file highlighting shows your current location

- **Route Type Detection**: Support for all SvelteKit routing patterns:

  - Static routes (/about, /contact)
  - Dynamic parameters ([param])
  - Rest parameters ([...param])
  - Optional parameters ([[param]])
  - Parameter matchers ([param=matcher])
  - Group layouts ((group))
  - Layout resets (+page@.svelte)

- **Intuitive Navigation**:
  - Direct file access from sidebar
  - Browser preview integration
  - Quick route search functionality

## Usage

### Visual Navigation

The extension adds a radar icon to your activity bar. Click it to see your project's routes.

### Smart Route Navigation

Press `Cmd/Ctrl + Shift + P` and type "Svelte Radar: Open Route", You can enter:

- Full URLs (example):
  - http://localhost:5173/blog/how-to-use-sveltekit/comments
  - https://myapp.com/shop/products/1234/reviews/foo/bar
- You can also use relative paths
  - /login
  - /dashboard/setings
- Opens:
  - /blog/[slug]/comments/+page.svelte
  - /products/[id=integer]/reviews/[...rest]/+page.svelte
  - /(auth)/login/+page.svelte
  - /dashboard/(admin)/settings/+page@(auth).svelte

Examples:

1. Complex nested dynamic route with parameter matcher:
   /products/[id=integer]/variants/[sku=alphanumeric]/reviews/[...page]/+page.svelte
2. Grouped route with layout reset:
   /(shop)/products/[category]/items/+page@(shop).svelte
3. Optional parameters with groups:
   /(docs)/[[lang]]/api/[[version]]/reference/+page.svelte

### Page Content Navigator

The Page Content Navigator helps you quickly navigate within your Svelte files by providing a structured view of sections and components.

#### Adding Section Markers

Add section markers in your code to create navigation points:

- For JavaScript/TypeScript sections:
  ```js
  // @sr My Section Name
  ```

- For HTML sections:
  ```html
  <!-- @sr My Section Name -->
  ```

#### Component Navigation

Components are automatically detected and displayed in the Page Content view:
- Click on a component to navigate to its usage in the current file
- For components with multiple instances, expand to see all occurrences
- Use the "Open Component File" action to jump directly to the component definition

#### Configuration

You can enable or disable the Page Content Navigator in your workspace configuration:

```json
// .vscode/svelte-radar.json
{
  "enablePageContentView": true  // Set to false to disable
}
```

### Route Types at a Glance

- 🟢 Static Routes (/about, /contact)
- 🔵 Dynamic Parameters (/blog/[slug])
- 🟣 Rest Parameters (/blog/[...slug])
- 🟡 Optional Parameters (/docs/[[lang]])
- 🟠 Group Routes (/(auth)/login)
- 🟤 Parameter Matchers (/user/[id=integer])
- 📄 Server Routes (+server.ts)
- 🔧 Server Logic (+page.server.ts, +layout.server.ts)
- 📱 Client Logic (+page.ts, +layout.ts)
- 🎨 Layouts (+layout.svelte)
- ⚠️ Error Pages (+error.svelte)

### Parameter Matchers

The extension supports the following built-in parameter matchers: -

- **integer**: Matches whole numbers
  /products/[id=integer] // matches: /products/123
- **float**: Matches decimal numbers
  /products/[price=float] // matches: /products/99.99
- **alpha**: Matches alphabetic characters
  /users/[name=alpha] // matches: /users/john
- **alphanumeric**: Matches letters and numbers
  /posts/[slug=alphanumeric] // matches: /posts/post123
- **uuid**: Matches UUID format
  /users/[id=uuid] // matches: /users/123e4567-e89b-12d3-a456-426614174000
- **date**: Matches YYYY-MM-DD format
  /events/[date=date] // matches: /events/2024-01-05
- **Custom matchers** are also supported and will always match:
  /products/[id=customMatcher] // matches any value

### Configuration

#### Workspace Settings

Create `.vscode/svelte-radar.json` in your workspace:

```json
{
  "projectRoot": "frontend/", // For monorepos or custom project locations. by default it uses the current workspace root.
  "port": 5173, // Dev server port (optional)
  "enablePageContentView": true // Enable/disable Page Content Navigator (optional, defaults to true)
}
```

#### Extension Settings

```json
{
  "svelteRadar.viewType": "flat",
  "svelteRadar.sortingType": "natural"
}
```

`svelteRadar.viewType` : Default view type ("flat" or "hierarchical")

`svelteRadar.sortingType` : Route sorting method ("natural" or "basic")
natural: Intelligently sorts numbered routes (default)
basic: Standard string comparison

## Flat View:

![image](https://github.com/user-attachments/assets/937ee134-2ee1-4be4-9dd8-77b97eed1f3f)

## Hierarchical View

![image](https://github.com/user-attachments/assets/64d36548-9af6-4ca5-a5f1-04f58e5b83f9)

## Page Content Navigator

![image](https://github.com/user-attachments/assets/9768c22f-fac7-4477-9f01-9a61f4701d10)
