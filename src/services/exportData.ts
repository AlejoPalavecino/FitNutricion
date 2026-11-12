import { offlineFirstStorage } from '../lib/storage';
export async function exportUserData(userId: string): Promise<void> {
  if (!userId) throw new Error('No hay una cuenta activa.');
  const raw = await offlineFirstStorage.getItem(`fitnutricion-user-data-v2:${userId}`);
  if (!raw) throw new Error('No hay datos guardados para exportar.');
  const blob = new Blob([raw], { type: 'application/json' }),
    url = URL.createObjectURL(blob),
    anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'fitnutricion-datos-personales.json';
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
