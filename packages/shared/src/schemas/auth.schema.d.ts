import * as yup from 'yup';
export declare const registerSchema: yup.ObjectSchema<{
    email: string;
    password: string;
}, yup.AnyObject, {
    email: undefined;
    password: undefined;
}, "">;
export declare const loginSchema: yup.ObjectSchema<{
    email: string;
    password: string;
}, yup.AnyObject, {
    email: undefined;
    password: undefined;
}, "">;
export type RegisterInput = yup.InferType<typeof registerSchema>;
export type LoginInput = yup.InferType<typeof loginSchema>;
export type LoginDto = LoginInput;
export type RegisterDto = RegisterInput;
//# sourceMappingURL=auth.schema.d.ts.map