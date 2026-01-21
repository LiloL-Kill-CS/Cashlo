// Generate transaction ID
export function generateTransactionId() {
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
  const timeStr = now.getTime().toString().slice(-4);
  return `TRX-${dateStr}-${timeStr}`;
}

// Format currency
export function formatCurrency(amount) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(amount);
}

// Format date
export function formatDate(date) {
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(date));
}

// Format number input (1000 -> "1.000")
export function formatNumberInput(value) {
  if (!value) return '';
  return value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

// Parse number input ("1.000" -> 1000)
export function parseNumberInput(value) {
  if (!value) return '';
  return value.replace(/\./g, '').replace(/,/g, '');
}
