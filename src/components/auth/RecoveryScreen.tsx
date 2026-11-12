import { useState } from 'react';
import { replaceRecoveredPassword } from '../../services/passwordRecovery';
import { useAuthStore } from '../../store/useAuthStore';
export function RecoveryScreen() {
  const [password, setPassword] = useState(''),
    [confirm, setConfirm] = useState(''),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false);
  return (
    <main className="mx-auto max-w-md p-6">
      <h1 className="text-2xl font-bold">Restablecer contraseña</h1>
      <form
        className="space-y-4"
        onSubmit={async (event) => {
          event.preventDefault();
          if (password !== confirm) {
            setMessage('Las contraseñas no coinciden.');
            return;
          }
          setBusy(true);
          try {
            await replaceRecoveredPassword(password);
            await useAuthStore.getState().logout();
            useAuthStore.setState({ isRecovering: false });
            window.history.replaceState(null, '', '/');
          } catch {
            setMessage(
              'No se pudo cambiar la contraseña. Comprueba el enlace y vuelve a solicitar uno si venció.',
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        <label className="block" htmlFor="recovery-password">
          Nueva contraseña
        </label>
        <input
          className="w-full border p-2"
          id="recovery-password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={8}
        />
        <label className="block" htmlFor="recovery-confirm">
          Repetir contraseña
        </label>
        <input
          className="w-full border p-2"
          id="recovery-confirm"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
        />
        <p role="alert">{message}</p>
        <button className="rounded bg-emerald-700 p-3 text-white" disabled={busy}>
          Guardar nueva contraseña
        </button>
      </form>
    </main>
  );
}
