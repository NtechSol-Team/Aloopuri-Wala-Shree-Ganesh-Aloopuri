import { prisma } from '../../config/prisma';
import type { AuthUser } from '../../shared/types/api';

// Generic key/value settings live in one small table (see AppSetting) — this is
// the only key in use so far.
const CALL_BUTTON_PHONE_KEY = 'CALL_BUTTON_PHONE';

/** The number a franchise owner's Call button dials. Null until the main owner sets one. */
export async function getCallButtonPhone(): Promise<string | null> {
  const row = await prisma.appSetting.findUnique({ where: { key: CALL_BUTTON_PHONE_KEY } });
  return row?.value || null;
}

export async function setCallButtonPhone(user: AuthUser, phone: string): Promise<string | null> {
  // Blank clears it — the Call button just disappears rather than dialling nothing.
  if (!phone.trim()) {
    await prisma.appSetting.deleteMany({ where: { key: CALL_BUTTON_PHONE_KEY } });
    return null;
  }
  const row = await prisma.appSetting.upsert({
    where: { key: CALL_BUTTON_PHONE_KEY },
    create: { key: CALL_BUTTON_PHONE_KEY, value: phone.trim(), updatedById: user.id },
    update: { value: phone.trim(), updatedById: user.id },
  });
  return row.value;
}

export const settingsService = { getCallButtonPhone, setCallButtonPhone };
