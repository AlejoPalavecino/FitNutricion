import { test, expect, type Page } from '@playwright/test';
async function register(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Crear Cuenta', exact: true }).click();
  await page.getByLabel('Tu nombre', { exact: true }).fill('Prueba Local');
  await page.getByLabel('Correo electrónico', { exact: true }).fill('qa@example.test');
  await page.getByLabel('Contraseña', { exact: true }).fill('Testing12345!');
  await page.getByLabel('Repetir contraseña', { exact: true }).fill('Testing12345!');
  await page.getByRole('button', { name: 'Crear mi cuenta', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Cerrar sesión', exact: true })).toBeVisible();
}
test('local registration, accessible labels and persistent draft survive reload', async ({
  page,
}) => {
  await register(page);
  const date = page.locator('input[type="date"]').first();
  await date.fill('1995-06-15');
  await expect
    .poll(() =>
      page.evaluate(() =>
        Object.keys(localStorage).some((k) => k.startsWith('fitnutricion-user-data-v2:')),
      ),
    )
    .toBe(true);
  await page.reload();
  await expect(page.locator('input[type="date"]').first()).toHaveValue('1995-06-15');
});
test('mobile logout and confirmed device wipe remove health copies', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await register(page);
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Salir y borrar datos del dispositivo' }).click();
  await expect(page.getByRole('button', { name: 'Entrar a mi cuenta' })).toBeVisible();
  expect(
    await page.evaluate(() =>
      Object.keys(localStorage).filter(
        (k) => k.startsWith('fitnutricion-user-data-') || k.startsWith('fitnutricion-sync-'),
      ),
    ),
  ).toEqual([]);
});
test('static shell reloads offline without caching authentication or health requests', async ({
  page,
  context,
}) => {
  await page.goto('/');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  const requests = await page.evaluate(async () => {
    const urls: string[] = [];
    for (const name of await caches.keys()) {
      const c = await caches.open(name);
      urls.push(...(await c.keys()).map((r) => new URL(r.url).pathname));
    }
    return urls;
  });
  expect(requests).toContain('/index.html');
  expect(
    requests.every(
      (p) => p.startsWith('/assets/') || ['/index.html', '/logo.jpg', '/manifest.json'].includes(p),
    ),
  ).toBe(true);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Entrar a mi cuenta' })).toBeVisible();
});

async function onboard(page: Page) {
  await register(page);
  await page.getByLabel('Fecha de nacimiento', { exact: true }).fill('1995-06-15');
  await page.getByLabel('Altura (cm)', { exact: true }).fill('180');
  await page.getByLabel('Peso actual (kg)', { exact: true }).fill('80');
  await page.getByRole('button', { name: 'Guardar mi Plan y Empezar' }).click();
  await expect(page.getByRole('button', { name: 'Crear mi primera rutina' })).toBeVisible();
}
test('quick actions trap keyboard focus and restore it on Escape', async ({ page }) => {
  await onboard(page);
  const trigger = page.getByRole('button', { name: 'Buscar comida o ejercicio...' });
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'Añadir rápido' });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('input').first()).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
});
test('two workouts preserve distinct set identities and historical loads', async ({ page }) => {
  await onboard(page);
  await page.getByRole('button', { name: 'Crear mi primera rutina' }).click();
  await page.getByLabel('Nombre de la rutina', { exact: true }).fill('Prueba de historial');
  await page.getByRole('button', { name: 'Agregar a la rutina', exact: true }).first().click();
  await page.getByRole('button', { name: 'Guardar Rutina', exact: true }).click();
  await page.getByRole('button', { name: 'Entrenar Hoy', exact: true }).click();
  await page
    .getByRole('spinbutton', { name: /^Peso, serie 1,/ })
    .first()
    .fill('40');
  await page.getByRole('button', { name: 'Marcar', exact: true }).first().click();
  await page.getByRole('button', { name: 'Guardar Entrenamiento', exact: true }).first().click();
  await page
    .getByRole('spinbutton', { name: /^Peso, serie 1,/ })
    .first()
    .fill('45');
  await page.getByRole('button', { name: 'Marcar', exact: true }).first().click();
  await page.getByRole('button', { name: 'Guardar Entrenamiento', exact: true }).first().click();
  const snapshot = await page.evaluate(() => {
    const key = Object.keys(localStorage).find((k) => k.startsWith('fitnutricion-user-data-v2:'))!;
    const envelope = JSON.parse(localStorage.getItem(key)!);
    return JSON.parse(envelope.value);
  });
  expect(snapshot.workoutSessions).toHaveLength(2);
  expect(
    snapshot.workoutSessions
      .map((s: { sets: { weightKg: number }[] }) => s.sets[0].weightKg)
      .sort(),
  ).toEqual([40, 45]);
  expect(
    new Set(snapshot.workoutSessions.map((s: { sets: { id: string }[] }) => s.sets[0].id)).size,
  ).toBe(2);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Entrenar Hoy', exact: true })).toBeVisible();
});
