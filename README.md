![svelte_radar_icon](https://github.com/user-attachments/assets/d3a53754-60ce-4c3c-8f1b-770e8f64cfb9)

# Svelte Radar

Svelte Radar is a Visual Studio Code extension designed to streamline your SvelteKit development experience. It provides a visual overview of your project's routing structure, helping you navigate complex route hierarchies with ease.

## Features

- **Route Visualization**: View all your SvelteKit routes in a hierarchical or flat structure
- **Smart Route Detection**: Automatically detects and displays all types of SvelteKit routes:
  - Static routes
  - Dynamic parameters ([param])
  - Rest parameters ([...param])
  - Optional parameters ([[param]])
  - Parameter matchers ([param=matcher])
  - Group layouts ((group))
  - Layout resets (+page@.svelte)
  
- **Quick Navigation**: Jump to route files directly from the sidebar
- **Preview in Browser**: Open any route in your default browser with one click
- **Route Search**: Quickly find routes with the built-in search functionality
- **Auto Port Detection**: Automatically detects your dev server port from configuration files

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

### Route Types at a Glance

- 🟢 Static Routes (/about, /contact)
- 🔵 Dynamic Parameters (/blog/[slug])
- 🟣 Rest Parameters (/blog/[...slug])
- 🟡 Optional Parameters (/docs/[[lang]])
- 🟠 Group Routes (/(auth)/login)
- 🟤 Parameter Matchers (/user/[id=integer])

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
 
 

## Configuration

```json
{
"svelteRadar.devServerPort": 5173,
"svelteRadar.viewType": "flat"
}
```
`svelteRadar.devServerPort` : Custom development server port. Only needed if we can't automatically detect it from your svelte.config.js, vite.config.js, or vite.config.ts.

`svelteRadar.viewType` : Default view type ("flat" or "hierarchical")

## Flat View:

![image](https://github.com/user-attachments/assets/937ee134-2ee1-4be4-9dd8-77b97eed1f3f)

## Hierarchical View

![image](https://github.com/user-attachments/assets/64d36548-9af6-4ca5-a5f1-04f58e5b83f9)

