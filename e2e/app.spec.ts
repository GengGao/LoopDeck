import { test, expect } from '@playwright/test';

test.describe('LoopDeck', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should display welcome screen on first load', async ({ page }) => {
    await expect(page.getByText('Welcome to LoopDeck')).toBeVisible();
    await expect(page.getByText('Drop JSONL file here')).toBeVisible();
  });

  test('should show file drop zone', async ({ page }) => {
    const dropZone = page.locator('text=Drop JSONL file here');
    await expect(dropZone).toBeVisible();
  });

  test('should have correct page title', async ({ page }) => {
    await expect(page).toHaveTitle(/LoopDeck/);
  });

  test('should toggle theme', async ({ page }) => {
    // Find the theme toggle button
    const themeToggle = page.getByRole('button', { name: /toggle theme/i });
    
    // Get initial state
    const html = page.locator('html');
    const initialClass = await html.getAttribute('class');
    
    // Click to toggle
    await themeToggle.click();
    
    // Verify class changed
    const newClass = await html.getAttribute('class');
    expect(newClass).not.toBe(initialClass);
  });
});

test.describe('JSONL Import', () => {
  test('should import JSONL file and show items', async ({ page }) => {
    await page.goto('/');

    // Create a test JSONL file
    const jsonlContent = `{"messages":[{"role":"user","content":"What is AI?"},{"role":"assistant","content":"AI stands for Artificial Intelligence."}]}
{"messages":[{"role":"user","content":"How does ML work?"},{"role":"assistant","content":"Machine Learning uses data to train models."}]}`;

    // Upload the file
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: 'test.jsonl',
      mimeType: 'application/json',
      buffer: Buffer.from(jsonlContent),
    });

    // Wait for import to complete
    await page.waitForTimeout(1000);

    // Check that items are displayed
    await expect(page.getByText('What is AI?')).toBeVisible();
  });
});

test.describe('Review Workflow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');

    // Import test data
    const jsonlContent = `{"messages":[{"role":"user","content":"Test question"},{"role":"assistant","content":"Test answer"}],"context":[{"text":"Context chunk 1","source":"doc1","score":0.95}]}`;

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: 'test.jsonl',
      mimeType: 'application/json',
      buffer: Buffer.from(jsonlContent),
    });

    await page.waitForTimeout(1000);
  });

  test('should select an item and show details', async ({ page }) => {
    // Click on the first item
    await page.getByText('Test question').click();

    // Verify detail panel shows
    await expect(page.getByText('Prompt')).toBeVisible();
    await expect(page.getByRole('button', { name: /approve/i })).toBeVisible();
  });

  test('should approve an item', async ({ page }) => {
    // Select item
    await page.getByText('Test question').click();

    // Click approve
    await page.getByRole('button', { name: /approve/i }).click();

    // Verify status changed
    await expect(page.getByText('approved')).toBeVisible();
  });
});

test.describe('Accessibility', () => {
  test('should be keyboard navigable', async ({ page }) => {
    await page.goto('/');

    // Tab through the interface
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');

    // Verify focus is visible
    const focusedElement = page.locator(':focus');
    await expect(focusedElement).toBeVisible();
  });
});
