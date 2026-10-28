import { test, expect } from '@playwright/test';
try {
  process.loadEnvFile('.env');
} catch {}
const email = `e2e-${Date.now()}@test.invalid`,
  password = 'test-password-at-least-12';
test('рабочий сценарий: регистрация, резюме, поиск, все страницы, CSV, защита', async ({
  page,
  request,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Первый запуск? Создать аккаунт' }).click();
  await page.getByLabel('Электронная почта').fill(email);
  await page.getByLabel('Пароль', { exact: true }).fill(password);
  await page.getByLabel('Код регистрации').fill(process.env.REGISTRATION_CODE ?? '');
  await page.getByRole('button', { name: 'Создать аккаунт', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Обзор поиска' })).toBeVisible();
  await page.getByRole('link', { name: 'Мои резюме', exact: true }).click();
  await page.getByRole('button', { name: 'Добавить резюме' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Название / желаемая должность').fill('Frontend Developer');
  await dialog
    .getByLabel('Полный текст резюме')
    .fill('Четыре года разрабатываю приложения на React и TypeScript. Реализовал личный кабинет.');
  await dialog.getByLabel('Ключевые навыки через запятую').fill('React, TypeScript');
  await dialog.getByLabel('Подтверждаю достоверность указанных данных').check();
  await dialog.getByRole('button', { name: 'Сохранить резюме' }).click();
  await expect(dialog).not.toBeVisible();
  await page
    .getByLabel('Подтверждённые факты и достижения')
    .fill('Разрабатываю приложения на React и TypeScript четыре года.');
  await page.getByRole('button', { name: 'Сохранить подтверждённые данные' }).click();
  await expect(page.getByText('База знаний обновлена')).toBeVisible();
  await page.getByRole('link', { name: 'Поисковые профили', exact: true }).click();
  await page.getByRole('button', { name: 'Создать профиль' }).click();
  await dialog.getByLabel('Название профиля').fill('React Remote');
  await dialog.getByLabel('Поисковый запрос').fill('React TypeScript');
  await dialog.getByLabel('Frontend Developer', { exact: true }).check();
  await dialog.getByRole('button', { name: 'Сохранить профиль' }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole('heading', { name: 'React Remote' })).toBeVisible();
  for (const [name, title] of [
    ['Вакансии', 'Вакансии'],
    ['Отклики', 'Отклики'],
    ['Требуют внимания', 'Требуют внимания'],
    ['Аналитика', 'Аналитика'],
    ['История активности', 'История активности'],
    ['Настройки', 'Настройки'],
  ]) {
    await page.getByRole('link', { name, exact: true }).click();
    await expect(page.getByRole('heading', { name: title, exact: true, level: 1 })).toBeVisible();
  }
  await page.getByRole('button', { name: 'Правила агента', exact: true }).click();
  await expect(page.getByLabel('Dry Run — анализировать и готовить без отправки')).toBeChecked();
  await page.getByRole('button', { name: 'Переключить тему' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  const unauth = await request.get('/api/applications');
  expect(unauth.status()).toBe(401);
  const csrf = await page.request.post('/api/agent', {
    data: { action: 'START' },
    headers: { Origin: 'https://evil.example' },
  });
  expect(csrf.status()).toBe(403);
  const origin = new URL(page.url()).origin;
  expect(
    (
      await request.post('/api/auth/login', {
        data: 'x'.repeat(160000),
        headers: { Origin: origin, 'Content-Type': 'application/json' },
      })
    ).status(),
  ).toBe(413);
  const configuration = {
    purpose: 'ANALYSIS',
    provider: 'OPENAI',
    baseUrl: 'https://api.openai.com/v1',
    model: 'test-model-not-called',
    apiKey: 'test-key-never-used',
  };
  expect(
    (
      await page.request.put('/api/providers', { data: configuration, headers: { Origin: origin } })
    ).status(),
  ).toBe(200);
  expect(
    (
      await page.request.put('/api/providers', {
        data: { ...configuration, baseUrl: 'http://api.openai.com/v1' },
        headers: { Origin: origin },
      })
    ).status(),
  ).toBe(400);
  const before = (await (await page.request.get('/api/providers')).json())[0];
  expect(before.hasKey).toBe(true);
  expect(before).not.toHaveProperty('apiKey');
  const { apiKey: unused, ...withoutKey } = configuration;
  void unused;
  expect(
    (
      await page.request.put('/api/providers', {
        data: { ...withoutKey, provider: 'OLLAMA', baseUrl: 'http://localhost:11434/v1' },
        headers: { Origin: origin },
      })
    ).status(),
  ).toBe(200);
  expect((await (await page.request.get('/api/providers')).json())[0].hasKey).toBe(false);
  const csv = await page.request.get('/api/export');
  expect(csv.status()).toBe(200);
  expect(await csv.text()).toContain('Вакансия');
  await expect(page.locator('[data-sonner-toast]')).toHaveCount(0);
  await page.screenshot({ path: 'test-results/workspace-dark.png', fullPage: true });
  await page.getByRole('link', { name: 'Обзор', exact: true }).click();
  await page.getByRole('button', { name: 'Переключить тему' }).click();
  await page.screenshot({ path: 'test-results/dashboard-light.png', fullPage: true });
});

test('мобильный экран и клавиатурное закрытие формы', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByLabel('Электронная почта').fill(email);
  await page.getByLabel('Пароль', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Обзор поиска' })).toBeVisible();
  await page.getByRole('button', { name: 'Открыть меню' }).click();
  await page.getByRole('link', { name: 'Поисковые профили', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Поисковые профили', exact: true, level: 1 }),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: 'React Remote', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.getByRole('button', { name: 'Создать профиль' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await page.screenshot({ path: 'test-results/mobile.png', fullPage: true });
});
