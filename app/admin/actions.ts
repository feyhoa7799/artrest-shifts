'use server';

async function deprecatedAdminAction() {
  throw new Error('Админские действия выполняются через защищённый /api/admin/actions');
}

export async function saveRestaurant() {
  await deprecatedAdminAction();
}

export async function saveSlot() {
  await deprecatedAdminAction();
}

export async function closeSlot() {
  await deprecatedAdminAction();
}

export async function reopenSlotAsNew() {
  await deprecatedAdminAction();
}

export async function rejectApplication() {
  await deprecatedAdminAction();
}

export async function approveApplication() {
  await deprecatedAdminAction();
}

export async function toggleEmployeeBlock() {
  await deprecatedAdminAction();
}
