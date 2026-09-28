export default function SetupError({ message }: { message: string }) {
  return (
    <div className="panel" style={{ padding: 16 }}>
      <h2 style={{ marginTop: 0 }}>Not connected yet</h2>
      <div className="error">{message}</div>
      <p className="muted">Check the environment variables and that <code>supabase/schema.sql</code> has been run. See README.</p>
    </div>
  );
}
