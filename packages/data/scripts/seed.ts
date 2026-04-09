import {
  noteAuditLogs,
  walletLabels,
  wallets,
  watchlistEntries
} from "@weather-smart-money/core";

const now = () => new Date().toISOString();

const escapeSql = (value: string) => value.replace(/'/g, "''");

const sqlValue = (value?: string | null) => {
  if (value === undefined || value === null || value.length === 0) {
    return "NULL";
  }
  return `'${escapeSql(value)}'`;
};

const statements: string[] = ["BEGIN TRANSACTION;"];

wallets.forEach((wallet) => {
  const createdAt = now();
  statements.push(
    `INSERT OR REPLACE INTO wallets (
      id,
      chain,
      address,
      normalized_address,
      display_name,
      alias,
      bio,
      strategy_focus,
      team_note,
      first_seen_at,
      created_at,
      updated_at,
      watchlisted
    ) VALUES (
      '${escapeSql(wallet.id)}',
      '${escapeSql(wallet.chain)}',
      '${escapeSql(wallet.address)}',
      '${escapeSql(wallet.normalizedAddress)}',
      '${escapeSql(wallet.displayName)}',
      ${sqlValue(wallet.alias)},
      ${sqlValue(wallet.bio)},
      ${sqlValue(wallet.strategyFocus)},
      ${sqlValue(wallet.teamNote)},
      '${escapeSql(wallet.firstSeenAt)}',
      '${createdAt}',
      '${createdAt}',
      ${wallet.watchlisted ? 1 : 0}
    );`
  );
});

walletLabels
  .filter((label) => label.source === "user")
  .forEach((label) => {
    statements.push(
      `INSERT OR REPLACE INTO wallet_user_labels (
        id,
        wallet_id,
        name,
        value,
        kind,
        source,
        evidence,
        created_at
      ) VALUES (
        '${escapeSql(label.id)}',
        '${escapeSql(label.walletId)}',
        '${escapeSql(label.name)}',
        '${escapeSql(label.value)}',
        '${escapeSql(label.kind)}',
        '${escapeSql(label.source)}',
        ${sqlValue(label.evidence)},
        '${escapeSql(label.createdAt)}'
      );`
    );
  });

watchlistEntries.forEach((entry) => {
  statements.push(
    `INSERT OR REPLACE INTO wallet_watchlist (
      id,
      wallet_id,
      note,
      created_at,
      updated_at
    ) VALUES (
      '${escapeSql(entry.id)}',
      '${escapeSql(entry.walletId)}',
      ${sqlValue(entry.note)},
      '${escapeSql(entry.createdAt)}',
      '${escapeSql(entry.createdAt)}'
    );`
  );
});

noteAuditLogs.forEach((note) => {
  statements.push(
    `INSERT OR REPLACE INTO wallet_audit_logs (
      id,
      wallet_id,
      action,
      content,
      actor,
      created_at
    ) VALUES (
      '${escapeSql(note.id)}',
      '${escapeSql(note.walletId)}',
      '${escapeSql(note.action)}',
      '${escapeSql(note.content)}',
      '${escapeSql(note.actor)}',
      '${escapeSql(note.createdAt)}'
    );`
  );

  if (note.action === "create_note") {
    statements.push(
      `INSERT OR REPLACE INTO wallet_notes (
        id,
        wallet_id,
        content,
        actor,
        created_at
      ) VALUES (
        '${escapeSql(note.id)}',
        '${escapeSql(note.walletId)}',
        '${escapeSql(note.content)}',
        '${escapeSql(note.actor)}',
        '${escapeSql(note.createdAt)}'
      );`
    );
  }
});

const inviteCreatedAt = now();
statements.push(
  `INSERT OR REPLACE INTO extension_invites (
    code,
    member_label,
    status,
    expires_at,
    created_at,
    updated_at
  ) VALUES (
    'demo-team',
    'Team Alpha',
    'active',
    NULL,
    '${inviteCreatedAt}',
    '${inviteCreatedAt}'
  );`
);

statements.push(
  `INSERT OR REPLACE INTO dataset_versions (dataset, version, updated_at)
   VALUES ('address_labels', 1, '${now()}');`
);

statements.push("COMMIT;");

console.log(statements.join("\n"));
