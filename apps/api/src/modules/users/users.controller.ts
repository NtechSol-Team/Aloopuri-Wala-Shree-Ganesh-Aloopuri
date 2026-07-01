import type { Request, Response } from 'express';
import { created, ok, paginated } from '../../shared/utils/apiResponse';
import { AppError } from '../../shared/utils/AppError';
import { usersService } from './users.service';
import type { CreateUserInput, ListUsersQuery, UpdateUserInput } from './users.schema';

export async function createUserController(req: Request, res: Response): Promise<Response> {
  if (!req.user) throw AppError.unauthorized();
  const user = await usersService.createUser(req.body as CreateUserInput, req.user.id);
  return created(res, user, 'User created');
}

export async function listUsersController(req: Request, res: Response): Promise<Response> {
  const { rows, meta } = await usersService.listUsers(req.query as unknown as ListUsersQuery);
  return paginated(res, rows, meta);
}

export async function getUserController(req: Request, res: Response): Promise<Response> {
  const user = await usersService.getUser(req.params.id);
  return ok(res, user);
}

export async function updateUserController(req: Request, res: Response): Promise<Response> {
  const user = await usersService.updateUser(req.params.id, req.body as UpdateUserInput);
  return ok(res, user, 'User updated');
}

export async function deactivateUserController(req: Request, res: Response): Promise<Response> {
  if (!req.user) throw AppError.unauthorized();
  const result = await usersService.deactivateUser(req.params.id, req.user.id);
  return ok(res, result, 'User deactivated');
}

export async function resetPasswordController(req: Request, res: Response): Promise<Response> {
  const result = await usersService.resetPassword(req.params.id, (req.body as { password: string }).password);
  return ok(res, result, 'Password reset');
}
