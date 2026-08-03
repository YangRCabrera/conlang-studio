import { getOrCreateDbUser } from '@/app/lib/current-user';
import { resultResponse } from '@/app/lib/http';
import { createRuleSvc, listRulesSvc } from '@/app/lib/rules';

/** Route segment params for language-scoped rule endpoints. */
type Params = { params: Promise<{ id: string }> };

/**
 * GET /api/languages/[id]/rules
 * Returns all rules of a language owned by the authenticated user, in
 * application order (`position` ascending).
 * Returns 404 if the language doesn't exist or belongs to another user.
 */
export async function GET(_req: Request, { params }: Params) {
  const user = await getOrCreateDbUser();
  if (!user) return new Response(null, { status: 401 });

  const { id } = await params;
  const result = await listRulesSvc(user, id);
  return resultResponse(result);
}

/**
 * POST /api/languages/[id]/rules
 * Creates a new rule for the language, appended to the end of the application
 * order (`position` is server-assigned and not accepted in the body).
 * Body: `{ target_phoneme_id?: string; target_group_id?: string; output_phoneme_id?: string;
 * left_context: RuleContext; right_context: RuleContext }` — exactly one target field;
 * an absent `output_phoneme_id` means deletion (Ø).
 * Returns the created rule row with status 201.
 */
export async function POST(req: Request, { params }: Params) {
  const user = await getOrCreateDbUser();
  if (!user) return new Response(null, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const result = await createRuleSvc(user, id, body);
  return resultResponse(result, 201);
}
