// A small dialog that asks for a line of text (a rejection note, a web name). Works on iOS and Android.
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, StyleSheet, View } from 'react-native';
import { Button, Card, Field, Row, T } from './ui';
import { useTheme } from '../theme';

export interface PromptRequest {
  title: string;
  message?: string;
  placeholder?: string;
  initial?: string;
  confirm: string;
  /** Refuse an empty answer, with this reason. */
  required?: string;
  destructive?: boolean;
  onSubmit: (text: string) => Promise<unknown> | void;
}

export function PromptModal({ request, onClose }: { request: PromptRequest | null; onClose: () => void }) {
  const { c } = useTheme();
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setText(request?.initial ?? '');
    setError('');
  }, [request]);
  if (!request) return null;

  async function submit() {
    if (!request) return;
    if (request.required && !text.trim()) return setError(request.required);
    setBusy(true);
    try {
      await request.onSubmit(text.trim());
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal transparent animationType="fade" visible onRequestClose={onClose}>
      <KeyboardAvoidingView style={s.backdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Card title={request.title} style={{ width: '100%', maxWidth: 420 }}>
          {request.message ? <T size={14} muted style={{ marginBottom: 8 }}>{request.message}</T> : null}
          <Field value={text} onChangeText={setText} placeholder={request.placeholder} multiline autoFocus inputStyle={{ minHeight: 60 }} />
          {error ? <T style={{ color: c.danger, marginBottom: 8 }}>{error}</T> : null}
          <Row>
            <Button title="Cancel" kind="secondary" style={{ flex: 1 }} onPress={onClose} />
            <Button title={request.confirm} kind={request.destructive ? 'danger' : 'primary'} style={{ flex: 1 }} busy={busy} onPress={submit} />
          </Row>
        </Card>
        <View />
      </KeyboardAvoidingView>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(20,4,18,0.6)', alignItems: 'center', justifyContent: 'center', padding: 20 },
});
