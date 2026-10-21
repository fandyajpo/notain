import { useState } from 'react';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  AlignEndHorizontal,
  Calculator,
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  GripVertical,
  Minus,
  MoveVertical,
  PanelTop,
  Pilcrow,
  Rows3,
  StickyNote,
  TextQuote,
  Trash2,
  UserRound,
} from 'lucide-react';
import type {
  BlockAlign,
  BlockType,
  BlockWidth,
  TemplateBlock,
} from '../../../core/template/model';
import { BLOCK_LABELS, BLOCK_TYPES, REQUIRED_BLOCK_TYPES } from '../../../core/template/model';
import {
  addBlock,
  canAddBlock,
  canHideBlock,
  canRemoveBlock,
  moveBlockBy,
  removeBlock,
  setBlockAlign,
  setBlockWidth,
  toggleBlockVisible,
} from '../../../core/template/layout';
import { cx, iconButtonClass } from '../../../lib/ui/classes';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { SegmentedControl } from '../ui/segmented';

type Props = {
  layout: TemplateBlock[];
  onChange: (layout: TemplateBlock[]) => void;
};

const ALIGN_OPTIONS: { align: BlockAlign; label: string; Icon: typeof AlignLeft }[] = [
  { align: 'left', label: 'Rata kiri', Icon: AlignLeft },
  { align: 'center', label: 'Rata tengah', Icon: AlignCenter },
  { align: 'right', label: 'Rata kanan', Icon: AlignRight },
];

const WIDTH_OPTIONS: { width: BlockWidth; label: string }[] = [
  { width: 'full', label: 'Penuh' },
  { width: 'wide', label: 'Sedang' },
  { width: 'narrow', label: 'Sempit' },
];

const BLOCK_ICONS: Record<BlockType, typeof AlignLeft> = {
  letterhead: PanelTop,
  richHeader: Pilcrow,
  customer: UserRound,
  items: Rows3,
  richContent: TextQuote,
  totals: Calculator,
  notes: StickyNote,
  richFooter: AlignEndHorizontal,
  divider: Minus,
  spacer: MoveVertical,
};

const REQUIRED = new Set<string>(REQUIRED_BLOCK_TYPES);

/** The order-and-alignment editor. Reordering works by drag, or by the arrows. */
export function BlockList({ layout, onChange }: Props) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const atLimit = !canAddBlock(layout);

  function handleDrop(targetId: string) {
    if (!dragId || dragId === targetId) return reset();
    const from = layout.findIndex((block) => block.id === dragId);
    const to = layout.findIndex((block) => block.id === targetId);
    onChange(moveBlockBy(layout, dragId, to - from));
    reset();
  }

  function reset() {
    setDragId(null);
    setOverId(null);
  }

  return (
    <div className="flex flex-col gap-4">
      <ul className="flex flex-col gap-2" aria-label="Blok invoice">
        {layout.map((block, index) => (
          <li
            key={block.id}
            draggable
            onDragStart={(event) => {
              setDragId(block.id);
              event.dataTransfer.effectAllowed = 'move';
              // Firefox will not start a drag without payload in `data`.
              event.dataTransfer.setData('text/plain', block.id);
            }}
            onDragOver={(event) => {
              if (!dragId) return;
              event.preventDefault();
              event.dataTransfer.dropEffect = 'move';
              setOverId(block.id);
            }}
            onDrop={(event) => {
              event.preventDefault();
              handleDrop(block.id);
            }}
            onDragEnd={reset}
            className={[
              'flex flex-wrap items-center gap-2 rounded-control border bg-card px-3 py-2.5',
              'transition-colors',
              overId === block.id && dragId && dragId !== block.id
                ? 'border-accent shadow-card'
                : 'border-border',
              dragId === block.id ? 'opacity-50' : '',
              block.visible ? '' : 'opacity-60',
            ].join(' ')}
            data-block-row={block.id}
          >
            <span
              className="cursor-grab text-muted active:cursor-grabbing"
              aria-hidden="true"
              title="Seret untuk memindahkan"
            >
              <GripVertical size={16} />
            </span>

            <span className="flex min-w-0 flex-1 items-center gap-2">
              <IconFor type={block.type} />
              <span className="min-w-0">
                <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                  <span className="truncate">{BLOCK_LABELS[block.type]}</span>
                  {REQUIRED.has(block.type) && (
                    <Badge variant="accent" size="sm">
                      wajib
                    </Badge>
                  )}
                </span>
                <span className="block text-xs text-muted">
                  {index + 1} dari {layout.length}
                  {block.visible ? '' : ' · disembunyikan'}
                </span>
              </span>
            </span>

            <SegmentedControl<BlockAlign>
              value={block.align}
              onChange={(align) => onChange(setBlockAlign(layout, block.id, align))}
              ariaLabel={`Perataan ${BLOCK_LABELS[block.type]}`}
              size="icon"
              options={ALIGN_OPTIONS.map(({ align, label, Icon }) => ({
                value: align,
                label: <Icon size={14} aria-hidden="true" />,
                title: label,
                ariaLabel: `${label}: ${BLOCK_LABELS[block.type]}`,
              }))}
            />

            <SegmentedControl<BlockWidth>
              value={block.width}
              onChange={(width) => onChange(setBlockWidth(layout, block.id, width))}
              ariaLabel={`Lebar ${BLOCK_LABELS[block.type]}`}
              size="sm"
              options={WIDTH_OPTIONS.map(({ width, label }) => ({
                value: width,
                label,
                title: `Lebar ${label.toLowerCase()}`,
                ariaLabel: `Lebar ${label}: ${BLOCK_LABELS[block.type]}`,
              }))}
            />

            <span className="flex items-center gap-0.5">
              <IconButton
                label={`Naikkan ${BLOCK_LABELS[block.type]}`}
                disabled={index === 0}
                onClick={() => onChange(moveBlockBy(layout, block.id, -1))}
              >
                <ChevronUp size={15} aria-hidden="true" />
              </IconButton>
              <IconButton
                label={`Turunkan ${BLOCK_LABELS[block.type]}`}
                disabled={index === layout.length - 1}
                onClick={() => onChange(moveBlockBy(layout, block.id, 1))}
              >
                <ChevronDown size={15} aria-hidden="true" />
              </IconButton>
              <IconButton
                label={
                  block.visible
                    ? `Sembunyikan ${BLOCK_LABELS[block.type]}`
                    : `Tampilkan ${BLOCK_LABELS[block.type]}`
                }
                disabled={!canHideBlock(layout, block)}
                onClick={() => onChange(toggleBlockVisible(layout, block.id))}
              >
                {block.visible ? (
                  <Eye size={15} aria-hidden="true" />
                ) : (
                  <EyeOff size={15} aria-hidden="true" />
                )}
              </IconButton>
              <IconButton
                label={`Hapus ${BLOCK_LABELS[block.type]}`}
                disabled={!canRemoveBlock(layout, block)}
                onClick={() => onChange(removeBlock(layout, block.id))}
                danger
              >
                <Trash2 size={15} aria-hidden="true" />
              </IconButton>
            </span>
          </li>
        ))}
      </ul>

      <div className="flex flex-col gap-2">
        <p className="text-eyebrow uppercase text-muted">Tambah blok</p>
        <div className="flex flex-wrap gap-2">
          {BLOCK_TYPES.map((type) => {
            const Icon = BLOCK_ICONS[type];
            return (
              <Button
                key={type}
                type="button"
                variant="secondary"
                size="sm"
                disabled={atLimit}
                onClick={() => onChange(addBlock(layout, type))}
              >
                <Icon size={14} className="text-muted" aria-hidden="true" />
                {BLOCK_LABELS[type]}
              </Button>
            );
          })}
        </div>
        {atLimit && <p className="text-xs text-muted">Blok sudah mencapai batas maksimum.</p>}
      </div>
    </div>
  );
}

function IconFor({ type }: { type: BlockType }) {
  const Icon = BLOCK_ICONS[type];
  return <Icon size={16} className="shrink-0 text-muted" aria-hidden="true" />;
}

function IconButton({
  label,
  disabled,
  onClick,
  danger = false,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={cx(
        iconButtonClass('sm'),
        // The danger tone has to win `iconButtonClass`'s own hover text.
        danger && 'hover:bg-danger-soft hover:text-danger!',
      )}
    >
      {children}
    </button>
  );
}
