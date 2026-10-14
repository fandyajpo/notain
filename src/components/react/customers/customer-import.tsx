import { useRef, useState } from 'react';
import { AlertCircle, Download, Upload } from 'lucide-react';
import { Button } from '../ui/button';
import { downloadCsv, readFileRows } from '../../../lib/excel';
import {
  CUSTOMER_TEMPLATE_ROWS,
  parseCustomerImportRows,
  type CustomerImportResult,
} from '../../../core/excel';
import { useImportCustomers } from '../../../lib/query/hooks/use-customers';
import { toast } from '../../../lib/ui/toast';
import { toAppError } from '../../../appwrite/errors';

/** How many row-level problems are listed before the rest are collapsed. */
const MAX_SHOWN_ISSUES = 5;

/**
 * Upload-a-file panel for importing customers from Excel.
 *
 * The flow is two-phase on purpose: a chosen file is parsed and previewed first
 * (valid rows plus any row-level problems), and nothing is written until the
 * user commits. SheetJS is only pulled in for `.xlsx`; `.csv` is parsed by the
 * safe hand-written reader in `core/excel`.
 */
export function CustomerImportPanel() {
  const fileRef = useRef<HTMLInputElement>(null);
  const importCustomers = useImportCustomers();

  const [result, setResult] = useState<CustomerImportResult | null>(null);
  const [fileName, setFileName] = useState('');
  const [reading, setReading] = useState(false);

  function reset() {
    setResult(null);
    setFileName('');
    if (fileRef.current) fileRef.current.value = '';
  }

  function handleTemplate() {
    downloadCsv('template-customer', CUSTOMER_TEMPLATE_ROWS);
  }

  async function handleFile(file: File) {
    setReading(true);
    setResult(null);
    try {
      const rows = await readFileRows(file);
      setResult(parseCustomerImportRows(rows));
      setFileName(file.name);
    } catch {
      toast('File tidak bisa dibaca. Pakai format .csv atau .xlsx.', { variant: 'error' });
    } finally {
      setReading(false);
    }
  }

  function handleCommit() {
    if (!result || result.customers.length === 0) return;
    importCustomers.mutate(result.customers, {
      onSuccess: ({ imported }) => {
        toast(`${imported} customer berhasil diimpor.`, { variant: 'success' });
        reset();
      },
      onError: (error) => toast(toAppError(error).message, { variant: 'error' }),
    });
  }

  return (
    <div className="flex flex-col gap-3 rounded-card border border-border bg-card p-4 shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-medium">Impor dari Excel</p>
          <p className="text-sm text-muted">
            Upload file <code className="rounded bg-background px-1">.csv</code> atau{' '}
            <code className="rounded bg-background px-1">.xlsx</code> berisi kolom{' '}
            <strong>Nama</strong> &amp; <strong>WhatsApp</strong>.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={handleTemplate}>
            <Download size={15} aria-hidden="true" />
            Template
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => fileRef.current?.click()}
            loading={reading}
          >
            <Upload size={15} aria-hidden="true" />
            Pilih File
          </Button>
        </div>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept=".csv,.xlsx,.txt"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void handleFile(file);
        }}
      />

      {result && (
        <div className="flex flex-col gap-3 rounded-control border border-border p-3">
          <p className="text-sm">
            <span className="font-medium">{fileName}</span>, {result.customers.length} baris siap
            diimpor
            {result.issues.length > 0 ? `, ${result.issues.length} baris bermasalah.` : '.'}
          </p>

          {result.issues.length > 0 && (
            <ul className="flex flex-col gap-1 text-xs text-danger">
              {result.issues.slice(0, MAX_SHOWN_ISSUES).map((issue) => (
                <li key={issue.row} className="flex items-start gap-1.5">
                  <AlertCircle size={13} className="mt-0.5 shrink-0" aria-hidden="true" />
                  <span>
                    Baris {issue.row}: {issue.message}
                  </span>
                </li>
              ))}
              {result.issues.length > MAX_SHOWN_ISSUES && (
                <li className="text-muted">
                  …dan {result.issues.length - MAX_SHOWN_ISSUES} lainnya.
                </li>
              )}
            </ul>
          )}

          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={handleCommit}
              loading={importCustomers.isPending}
              disabled={result.customers.length === 0}
            >
              Impor {result.customers.length} customer
            </Button>
            <Button variant="ghost" size="sm" onClick={reset}>
              Batal
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
