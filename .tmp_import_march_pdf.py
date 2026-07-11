import re
import sqlite3
from pypdf import PdfReader

pdf_path = '/Users/mangpijasuan/Downloads/2026 Millionaires Club Monthly Contributions - March.pdf'
db_path = 'prisma/dev.db'
month_year = 'Mar-2026'

reader = PdfReader(pdf_path)
text = '\n'.join((p.extract_text() or '') for p in reader.pages).replace('\u00a0', ' ')

pattern = re.compile(r'(MC-\d{5}).{0,120}?\$\s*([0-9]+(?:\.[0-9]{1,2})?)\s*(Cash|Online|Auto-pay|Check|Zelle|Venmo|Other)', re.IGNORECASE)
rows = {}
for m in pattern.finditer(text):
    member_id = m.group(1)
    amount = float(m.group(2))
    method = m.group(3)
    method = method[0].upper() + method[1:]
    if method.lower() == 'auto-pay':
        method = 'Auto-pay'
    rows.setdefault(member_id, (amount, method))

conn = sqlite3.connect(db_path)
cur = conn.cursor()

cur.execute('SELECT id, legalName, archiveLifetime FROM Member')
member_map = {mid: (name, arch or 0.0) for mid, name, arch in cur.fetchall()}

cur.execute('SELECT memberId FROM Contribution WHERE monthYear=?', (month_year,))
existing = {r[0] for r in cur.fetchall()}

cur.execute("SELECT transactionId FROM Contribution WHERE transactionId LIKE 'CON-%'")
max_n = 0
for (tid,) in cur.fetchall():
    try:
        max_n = max(max_n, int(tid.split('-')[1]))
    except Exception:
        pass

inserted = 0
skipped_existing = 0
skipped_unknown_member = 0

for member_id, (amount, method) in sorted(rows.items()):
    if member_id in existing:
        skipped_existing += 1
        continue
    if member_id not in member_map:
        skipped_unknown_member += 1
        continue

    max_n += 1
    txid = f'CON-{max_n:05d}'
    legal_name = member_map[member_id][0]

    payment_date = 1773532800000 if method == 'Auto-pay' else 1775001600000

    cur.execute(
        """
        INSERT INTO Contribution (
          id, transactionId, memberId, memberName, paymentDate, monthYear, amount,
          paymentMethod, receivedBy, comments, source, entryTimestamp
        ) VALUES (
          lower(hex(randomblob(16))), ?, ?, ?, ?, ?, ?, ?, NULL, 'Imported from March PDF', 'Admin', strftime('%s','now')*1000
        )
        """,
        (txid, member_id, legal_name, payment_date, month_year, amount, method)
    )
    inserted += 1

cur.execute(
    """
    UPDATE Member
    SET contributions2026 = COALESCE((
          SELECT SUM(c.amount)
          FROM Contribution c
          WHERE c.memberId = Member.id AND c.monthYear LIKE '%-2026'
        ), 0),
        overallContributions = COALESCE(archiveLifetime, 0) + COALESCE((
          SELECT SUM(c.amount)
          FROM Contribution c
          WHERE c.memberId = Member.id AND c.monthYear LIKE '%-2026'
        ), 0)
    """
)

conn.commit()

cur.execute('SELECT COUNT(DISTINCT memberId), COALESCE(SUM(amount),0) FROM Contribution WHERE monthYear=?', (month_year,))
paid_count, total_amount = cur.fetchone()
cur.execute("SELECT COUNT(*) FROM Member WHERE status='Active'")
active_count = cur.fetchone()[0]

print({
    'parsed_from_pdf': len(rows),
    'inserted': inserted,
    'skipped_existing': skipped_existing,
    'skipped_unknown_member': skipped_unknown_member,
    'march_paid_count': paid_count,
    'march_total_amount': total_amount,
    'active_members': active_count,
})

conn.close()
