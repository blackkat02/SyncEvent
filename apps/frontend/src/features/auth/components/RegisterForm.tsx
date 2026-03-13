// src/features/auth/components/RegisterForm.tsx
import { useForm } from "react-hook-form";
import { yupResolver } from "@hookform/resolvers/yup";
import { registerSchema, type RegisterInput } from "@syncevent/shared";
import { useAppDispatch } from "../../../store/hooks";
import { registerUser } from "../../../store/slices/auth/authSlice";

export const RegisterForm = () => {
  const dispatch = useAppDispatch();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterInput>({
    resolver: yupResolver(registerSchema),
  });

  const onSubmit = (data: RegisterInput) => {
    dispatch(registerUser(data));
  };

  return (
    <div className="w-full max-w-md p-8 bg-white rounded-2xl shadow-lg">
      <h2 className="text-2xl font-bold mb-6 text-center">Create Account</h2>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700">
            Email
          </label>
          <input
            {...register("email")}
            className={`w-full p-3 border rounded-xl outline-none focus:ring-2 ${errors.email ? "border-red-500" : "focus:ring-blue-500"}`}
          />
          {errors.email && (
            <p className="text-red-500 text-xs mt-1">{errors.email.message}</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">
            Password
          </label>
          <input
            type="password"
            {...register("password")}
            className={`w-full p-3 border rounded-xl outline-none focus:ring-2 ${errors.password ? "border-red-500" : "focus:ring-blue-500"}`}
          />
          {errors.password && (
            <p className="text-red-500 text-xs mt-1">
              {errors.password.message}
            </p>
          )}
        </div>

        <button
          type="submit"
          className="w-full py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition"
        >
          Sign Up
        </button>
      </form>
    </div>
  );
};
