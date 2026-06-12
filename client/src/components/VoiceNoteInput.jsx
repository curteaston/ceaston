import { useEffect, useRef, useState } from 'react';

const SpeechRecognition =
  typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition);

/**
 * Note composer with browser speech-to-text (Web Speech API).
 * Click the mic, speak, and the transcript streams into the textarea; when the
 * mic stops, the note is saved automatically (source: 'voice'). Typed notes
 * save via the button. Text stays editable at all times before saving.
 */
export default function VoiceNoteInput({ placeholder = 'Add a note…', onSave, compact = false }) {
  const [text, setText] = useState('');
  const [listening, setListening] = useState(false);
  const [saving, setSaving] = useState(false);
  const recRef = useRef(null);
  const textRef = useRef('');
  const baseRef = useRef('');
  const spokeRef = useRef(false);

  textRef.current = text;

  useEffect(() => () => recRef.current?.abort(), []);

  const save = async (source) => {
    const body = textRef.current.trim();
    if (!body || saving) return;
    setSaving(true);
    try {
      await onSave(body, source);
      setText('');
      spokeRef.current = false;
    } finally {
      setSaving(false);
    }
  };

  const startListening = () => {
    const rec = new SpeechRecognition();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = navigator.language || 'en-US';
    baseRef.current = textRef.current ? textRef.current.replace(/\s*$/, ' ') : '';

    rec.onresult = (event) => {
      let final = '';
      let interim = '';
      for (const result of event.results) {
        if (result.isFinal) final += result[0].transcript + ' ';
        else interim += result[0].transcript;
      }
      if (final || interim) spokeRef.current = true;
      setText((baseRef.current + final + interim).replace(/\s+/g, ' ').trimStart());
    };
    rec.onerror = () => {};
    rec.onend = () => {
      setListening(false);
      recRef.current = null;
      // Auto-save the transcription once dictation ends.
      if (spokeRef.current && textRef.current.trim()) save('voice');
    };

    recRef.current = rec;
    spokeRef.current = false;
    rec.start();
    setListening(true);
  };

  const stopListening = () => recRef.current?.stop();

  return (
    <div className={`voice-note ${compact ? 'compact' : ''}`}>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={listening ? 'Listening…' : placeholder}
        rows={compact ? 2 : 3}
        disabled={saving}
      />
      <div className="voice-note-actions">
        {SpeechRecognition ? (
          <button
            type="button"
            className={`mic-btn ${listening ? 'recording' : ''}`}
            title={listening ? 'Stop recording (saves automatically)' : 'Dictate a note'}
            onClick={listening ? stopListening : startListening}
          >
            {listening ? '◼ Stop' : '🎤 Dictate'}
          </button>
        ) : (
          <span className="muted small">Speech-to-text needs Chrome/Edge/Safari</span>
        )}
        <button
          type="button"
          className="btn primary"
          disabled={!text.trim() || saving || listening}
          onClick={() => save('typed')}
        >
          {saving ? 'Saving…' : 'Save note'}
        </button>
      </div>
    </div>
  );
}
