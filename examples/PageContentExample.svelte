<script>
    // @sr Imports Section
    import { onMount } from 'svelte';
    import Button from './components/Button.svelte';
    import Card from './components/Card.svelte';
    import { fetchData } from './utils/api';

    // @sr State Variables
    let items = [];
    let loading = true;
    let error = null;

    // @sr Lifecycle Methods
    onMount(async () => {
        try {
            items = await fetchData('/api/items');
        } catch (err) {
            error = err.message;
        } finally {
            loading = false;
        }
    });

    // @sr Event Handlers
    function handleClick(id) {
        console.log('Item clicked:', id);
    }
</script>

<!-- @sr Page Header -->
<header class="page-header">
    <h1>Page Content Example</h1>
    <p>This example demonstrates the Page Content Navigator feature</p>
</header>

<!-- @sr Loading State -->
{#if loading}
    <div class="loading-spinner">
        Loading...
    </div>
{:else if error}
    <div class="error-message">
        Error: {error}
    </div>
{:else}
    <!-- @sr Item List -->
    <div class="item-container">
        {#each items as item (item.id)}
            <Card>
                <h2>{item.title}</h2>
                <p>{item.description}</p>
                <Button on:click={() => handleClick(item.id)}>
                    View Details
                </Button>
            </Card>
        {/each}
    </div>
{/if}

<style>
    .page-header {
        margin-bottom: 2rem;
        text-align: center;
    }

    .loading-spinner {
        display: flex;
        justify-content: center;
        padding: 2rem;
    }

    .error-message {
        color: red;
        padding: 1rem;
        border: 1px solid red;
        border-radius: 4px;
    }

    .item-container {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
        gap: 1rem;
    }
</style> 