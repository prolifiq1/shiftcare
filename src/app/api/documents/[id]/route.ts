import { db } from "@/lib/db";
import { documents } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { getSession, audit } from "@/lib/auth";

const ADMIN_ROLES = ["AGENCY_ADMIN", "COORDINATOR", "COMPLIANCE", "FINANCE", "SUPER_ADMIN"];

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });

  const { id } = await params;
  const doc = await db.select().from(documents).where(eq(documents.id, id)).get();
  if (!doc) return new Response("Not found", { status: 404 });

  // Tenant isolation + access: same agency, and either an admin role or the
  // worker who owns the document.
  const sameAgency = doc.agencyId === session.agencyId;
  const isAdmin = ADMIN_ROLES.includes(session.role);
  const isOwner = doc.workerId === session.id;
  if (!sameAgency || (!isAdmin && !isOwner)) {
    return new Response("Forbidden", { status: 403 });
  }

  const buf = Buffer.from(doc.contentBase64, "base64");
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": doc.mimeType || "application/octet-stream",
      "Content-Disposition": `inline; filename="${encodeURIComponent(doc.fileName)}"`,
      "Cache-Control": "private, no-store",
    },
  });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });

  const { id } = await params;
  const doc = await db.select().from(documents).where(eq(documents.id, id)).get();
  if (!doc) return new Response("Not found", { status: 404 });

  const sameAgency = doc.agencyId === session.agencyId;
  const isAdmin = ADMIN_ROLES.includes(session.role);
  const isOwner = doc.workerId === session.id;
  if (!sameAgency || (!isAdmin && !isOwner)) {
    return new Response("Forbidden", { status: 403 });
  }

  await db.delete(documents).where(eq(documents.id, id)).run();
  await audit(session.id, session.agencyId, "document.delete", { type: "document", id }, { kind: doc.kind });
  return Response.json({ ok: true });
}
