import Placeholder from '@tiptap/extension-placeholder';
import StarterKit from '@tiptap/starter-kit';
import { EditorContent, useEditor, type Editor } from '@tiptap/react';
import { Bold, Heading3, Italic, List, ListOrdered, RemoveFormatting } from 'lucide-react';
import { useEffect } from 'react';

type Props = {
  label: string;
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeight?: number;
};

/**
 * Rich-text editor used for the three freely editable invoice zones.
 * Emits empty string when the content is blank so persistence stays tidy.
 */
export function RichEditor({ label, value, onChange, placeholder, minHeight = 96 }: Props) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3] } }),
      Placeholder.configure({ placeholder: placeholder ?? '' }),
    ],
    content: value,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: 'notain-rich-text',
        style: `min-height:${minHeight}px`,
        'aria-label': label,
      },
    },
    onUpdate: ({ editor: current }) => {
      onChange(current.isEmpty ? '' : current.getHTML());
    },
  });

  // Adopt external value changes (for example when the form resets or an
  // existing invoice finishes loading) without looping back through onUpdate.
  useEffect(() => {
    if (!editor) return;
    if (editor.getHTML() === value) return;
    editor.commands.setContent(value, { emitUpdate: false });
  }, [editor, value]);

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-foreground">{label}</span>
      <div className="rounded-control border border-border bg-card shadow-card focus-within:border-accent">
        <Toolbar editor={editor} />
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}

function Toolbar({ editor }: { editor: Editor | null }) {
  const disabled = !editor;

  return (
    <div className="flex flex-wrap items-center gap-0.5 rounded-t-[calc(var(--radius-control)-1px)] border-b border-border bg-sunken px-2.5 py-1">
      <ToolbarButton
        label="Tebal"
        icon={<Bold size={15} />}
        disabled={disabled}
        active={editor?.isActive('bold') ?? false}
        onClick={() => editor?.chain().focus().toggleBold().run()}
      />
      <ToolbarButton
        label="Miring"
        icon={<Italic size={15} />}
        disabled={disabled}
        active={editor?.isActive('italic') ?? false}
        onClick={() => editor?.chain().focus().toggleItalic().run()}
      />
      <span className="mx-1 h-4 w-px bg-border" aria-hidden="true" />
      <ToolbarButton
        label="Daftar berbutir"
        icon={<List size={15} />}
        disabled={disabled}
        active={editor?.isActive('bulletList') ?? false}
        onClick={() => editor?.chain().focus().toggleBulletList().run()}
      />
      <ToolbarButton
        label="Daftar bernomor"
        icon={<ListOrdered size={15} />}
        disabled={disabled}
        active={editor?.isActive('orderedList') ?? false}
        onClick={() => editor?.chain().focus().toggleOrderedList().run()}
      />
      <ToolbarButton
        label="Judul"
        icon={<Heading3 size={15} />}
        disabled={disabled}
        active={editor?.isActive('heading', { level: 3 }) ?? false}
        onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()}
      />
      <span className="mx-1 h-4 w-px bg-border" aria-hidden="true" />
      <ToolbarButton
        label="Hapus format"
        icon={<RemoveFormatting size={15} />}
        disabled={disabled}
        onClick={() => editor?.chain().focus().unsetAllMarks().clearNodes().run()}
      />
    </div>
  );
}

type ToolbarButtonProps = {
  label: string;
  icon: React.ReactNode;
  disabled: boolean;
  active?: boolean;
  onClick: () => void;
};

function ToolbarButton({ label, icon, disabled, active = false, onClick }: ToolbarButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={[
        'rounded-control p-1.5 text-muted transition-colors hover:bg-card hover:text-foreground focus-ring',
        active ? 'bg-card text-foreground' : '',
        disabled ? 'opacity-40' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {icon}
    </button>
  );
}
