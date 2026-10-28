import { z } from 'zod';

export const loginSchema = z.object({
  username: z
    .string({ error: 'Username is required.' })
    .trim()
    .min(1, 'Username is required.')
    .max(64, 'Username is too long.'),
  password: z
    .string({ error: 'Password is required.' })
    .min(1, 'Password is required.')
    .max(200, 'Password is too long.'),
});

export type LoginInput = z.infer<typeof loginSchema>;
