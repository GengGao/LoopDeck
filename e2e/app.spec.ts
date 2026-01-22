import { expect, test } from '@playwright/test';

test.describe('LoopDeck', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should display welcome screen on first load', async ({ page }) => {
    await expect(page.getByText('Welcome to LoopDeck')).toBeVisible();
    await expect(page.getByText('Drop JSONL or JSON file here')).toBeVisible();
  });

  test('should show file drop zone', async ({ page }) => {
    const dropZone = page.locator('text=Drop JSONL or JSON file here');
    await expect(dropZone).toBeVisible();
  });

  test('should have correct page title', async ({ page }) => {
    await expect(page).toHaveTitle(/LoopDeck/);
  });

  test('should toggle theme', async ({ page }) => {
    // Find the theme toggle button
    const themeToggle = page.getByRole('button', { name: 'Toggle theme' });

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
    // Find the approve button in the detail panel (success variant)
    const approveButton = page
      .locator('button:has-text("Approve")')
      .filter({ hasText: /^Approve$/ });
    await expect(approveButton).toBeVisible();
  });

  test('should approve an item', async ({ page }) => {
    // Select item
    await page.getByText('Test question').click();

    // Click approve
    const approveButton = page
      .locator('button:has-text("Approve")')
      .filter({ hasText: /^Approve$/ });
    await approveButton.click();

    // Verify status changed
    const statusBadge = page.locator('.flex.flex-col.h-full').last().getByText('approved');
    await expect(statusBadge).toBeVisible();
  });
});

test.describe('Accessibility', () => {
  test('should have accessible interactive elements', async ({ page }) => {
    await page.goto('/');

    // Wait for the page to load
    await expect(page.getByText('Welcome to LoopDeck')).toBeVisible();

    // Verify that interactive elements are present and accessible
    const themeToggle = page.getByRole('button', { name: 'Toggle theme' });
    await expect(themeToggle).toBeVisible();

    // Verify the file drop zone is accessible
    const dropZone = page.getByText('Drop JSONL or JSON file here');
    await expect(dropZone).toBeVisible();
  });
});
