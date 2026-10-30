"""Onde o trabalhador grava: Supabase (PostgREST + Storage) ou memória (nos testes)."""
import time

import httpx


def now_ms():
    return int(time.time() * 1000)


class SupabaseStore:
    """Fala com o Supabase usando a chave de serviço (que fica só no servidor)."""

    def __init__(self, url, service_key, bucket="media"):
        self.url = url.rstrip("/")
        self.bucket = bucket
        self.h = {"apikey": service_key, "Authorization": f"Bearer {service_key}"}
        self.http = httpx.Client(timeout=60)

    def _rest(self, method, table, params=None, json=None, prefer=None):
        headers = dict(self.h)
        if prefer:
            headers["Prefer"] = prefer
        r = self.http.request(method, f"{self.url}/rest/v1/{table}", params=params, json=json, headers=headers)
        r.raise_for_status()
        return r.json() if r.content else None

    def select(self, table, filters=None, order=None, limit=None, columns="*"):
        params = {"select": columns, **(filters or {})}
        if order:
            params["order"] = order
        if limit:
            params["limit"] = str(limit)
        return self._rest("GET", table, params=params)

    def upsert(self, table, rows, on_conflict=None):
        if not rows:
            return
        params = {"on_conflict": on_conflict} if on_conflict else None
        for i in range(0, len(rows), 500):
            self._rest("POST", table, params=params, json=rows[i:i + 500], prefer="resolution=merge-duplicates,return=minimal")

    def insert(self, table, rows):
        if rows:
            self._rest("POST", table, json=rows, prefer="return=minimal")

    def update(self, table, filters, patch):
        self._rest("PATCH", table, params=filters, json=patch, prefer="return=minimal")

    def delete(self, table, filters):
        self._rest("DELETE", table, params=filters, prefer="return=minimal")

    def public_url(self, path):
        return f"{self.url}/storage/v1/object/public/{self.bucket}/{path}"

    def upload(self, path, data, content_type):
        r = self.http.post(f"{self.url}/storage/v1/object/{self.bucket}/{path}", content=data,
                           headers={**self.h, "Content-Type": content_type, "x-upsert": "true", "Cache-Control": "max-age=31536000"})
        r.raise_for_status()
        return self.public_url(path)

    def remove(self, paths):
        if paths:
            self.http.request("DELETE", f"{self.url}/storage/v1/object/{self.bucket}", json={"prefixes": list(paths)}, headers=self.h).raise_for_status()


def _match(row, filters):
    for col, expr in (filters or {}).items():
        if expr.startswith("not."):
            if _match(row, {col: expr[4:]}):
                return False
            continue
        op, _, val = expr.partition(".")
        v = row.get(col)
        if op == "is":
            if (val == "null") != (v is None):
                return False
            continue
        if op == "in":
            if str(v) not in val.strip("()").split(","):
                return False
            continue
        if v is None:
            return False
        cast = type(v)(val) if isinstance(v, (int, float)) and not isinstance(v, bool) else (val == "true" if isinstance(v, bool) else val)
        if not {"eq": v == cast, "neq": v != cast, "lt": v < cast, "lte": v <= cast, "gt": v > cast, "gte": v >= cast}[op]:
            return False
    return True


KEYS = {"profile_tags": ("profile_id", "tag_id"), "user_state": ("post_id",), "metrics": ("post_id", "at"), "worker_status": ("id",)}


class MemoryStore:
    """Mesmo jeito do SupabaseStore, em memória. Usado nos testes."""

    def __init__(self):
        self.t = {}
        self.files = {}
        self.seq = 0

    def rows(self, table):
        return self.t.setdefault(table, [])

    def select(self, table, filters=None, order=None, limit=None, columns="*"):
        out = [dict(r) for r in self.rows(table) if _match(r, filters)]
        if order:
            col, _, d = order.partition(".")
            out.sort(key=lambda r: (r.get(col) is None, r.get(col) or 0), reverse=d.startswith("desc"))
        return out[:limit] if limit else out

    def upsert(self, table, rows, on_conflict=None):
        keys = tuple(on_conflict.split(",")) if on_conflict else KEYS.get(table, ("id",))
        for r in rows:
            cur = next((x for x in self.rows(table) if all(x.get(k) == r.get(k) for k in keys)), None)
            if cur:
                cur.update(r)
            else:
                self.rows(table).append(dict(r))
            (cur or self.rows(table)[-1])["updated_at"] = now_ms()

    def insert(self, table, rows):
        for r in rows:
            self.seq += 1
            self.rows(table).append({"id": self.seq, **r})

    def update(self, table, filters, patch):
        for r in self.rows(table):
            if _match(r, filters):
                r.update(patch)

    def delete(self, table, filters):
        self.t[table] = [r for r in self.rows(table) if not _match(r, filters)]

    def public_url(self, path):
        return "mem://" + path

    def upload(self, path, data, content_type):
        self.files[path] = data
        return self.public_url(path)

    def remove(self, paths):
        for p in paths:
            self.files.pop(p, None)
