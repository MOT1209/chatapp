import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Check, LogOut, Pencil, ShieldCheck } from "lucide-react";

import { updateProfileSchema, type UpdateProfileValues } from "./schemas";
import { usersApi } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { useSession } from "@/features/auth/SessionProvider";
import { Avatar } from "@/components/Avatar";
import { Button } from "@/components/Button";
import { Input } from "@/components/Input";
import { ErrorState } from "@/components/ErrorState";
import { Skeleton } from "@/components/Skeleton";
import { applyApiFieldErrors } from "@/lib/form-errors";
import { formatPresence } from "@/lib/format";
import { cn } from "@/lib/cn";
import type { User } from "@/lib/types";

type ProfilePanelProps = {
  /** The user to show. `null` means the signed-in user. */
  userId: string | null;
  currentUser: User | null;
};

/**
 * The profile screen, used both as a full page on mobile and as the desktop details
 * pane. Only the signed-in user gets editing controls and the logout button.
 */
export function ProfilePanel({ userId, currentUser }: ProfilePanelProps) {
  const { setUser } = useSession();
  const queryClient = useQueryClient();

  const isOwnProfile = userId === null;
  const [isEditing, setIsEditing] = useState(false);

  const profileQuery = useQuery({
    queryKey: queryKeys.user(userId ?? currentUser?.id ?? "me"),
    queryFn: ({ signal }) => (isOwnProfile ? Promise.resolve(currentUser!) : usersApi.byId(userId!, signal)),
    enabled: isOwnProfile ? Boolean(currentUser) : Boolean(userId),
    staleTime: 30_000,
  });

  // Editing belongs to the signed-in user only, and starts closed.
  useEffect(() => {
    setIsEditing(false);
  }, [userId]);

  const user = profileQuery.data ?? (isOwnProfile ? currentUser : null);

  if (profileQuery.isError) {
    return (
      <ErrorState
        error={profileQuery.error}
        title="تعذّر تحميل الملف الشخصي"
        onRetry={() => void profileQuery.refetch()}
        isRetrying={profileQuery.isFetching}
        className="h-full"
      />
    );
  }

  if (!user) {
    return (
      <div className="space-y-4 p-5">
        <Skeleton className="mx-auto size-24 rounded-full" />
        <Skeleton className="mx-auto h-4 w-32" />
        <Skeleton className="mx-auto h-3 w-20" />
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto">
      <div className="flex flex-col items-center gap-3 px-5 py-8 text-center">
        <Avatar
          name={user.displayName}
          seed={user.id}
          src={user.avatarUrl}
          size="xl"
          isOnline={user.isOnline}
          className="shadow-sm"
        />

        <div className="space-y-1">
          <h1 className="text-lg font-bold tracking-tight text-fg">{user.displayName}</h1>
          <p dir="ltr" className="text-sm text-fg-muted">
            @{user.username}
          </p>
          <p
            className={cn(
              "text-xs font-medium",
              user.isOnline ? "text-success" : "text-fg-subtle",
            )}
          >
            {formatPresence(user.isOnline, user.lastSeenAt)}
          </p>
        </div>

        {isOwnProfile && !isEditing ? (
          <Button variant="secondary" size="sm" onClick={() => setIsEditing(true)}>
            <Pencil className="size-3.5" />
            تعديل الملف الشخصي
          </Button>
        ) : null}
      </div>

      {isOwnProfile && isEditing ? (
        <EditProfileForm
          user={user}
          onCancel={() => setIsEditing(false)}
          onSaved={(updated) => {
            setUser(updated);
            void queryClient.setQueryData(queryKeys.user(updated.id), updated);
            setIsEditing(false);
          }}
        />
      ) : (
        <ProfileDetails user={user} showEmail={isOwnProfile} />
      )}
    </div>
  );
}

/** Read-only facts. Email is shown only to its owner. */
function ProfileDetails({ user, showEmail = false }: { user: User; showEmail?: boolean }) {
  return (
    <dl className="space-y-px border-t border-border text-sm">
      {showEmail ? (
        <div className="flex items-center justify-between gap-3 px-5 py-3">
          <dt className="text-fg-muted">البريد الإلكتروني</dt>
          <dd dir="ltr" className="truncate font-medium text-fg">
            {user.email}
          </dd>
        </div>
      ) : null}
      <div className="flex items-center justify-between gap-3 px-5 py-3">
        <dt className="text-fg-muted">اسم المستخدم</dt>
        <dd dir="ltr" className="truncate font-medium text-fg">
          {user.username}
        </dd>
      </div>
      <div className="flex items-center justify-between gap-3 px-5 py-3">
        <dt className="text-fg-muted">الحالة</dt>
        <dd className="font-medium text-fg">{user.isOnline ? "متصل" : "غير متصل"}</dd>
      </div>
    </dl>
  );
}

/** Display name and avatar URL, with the save and cancel actions. */
function EditProfileForm({
  user,
  onSaved,
  onCancel,
}: {
  user: User;
  onSaved: (user: User) => void;
  onCancel: () => void;
}) {
  const [formError, setFormError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const update = useMutation({
    mutationFn: (values: UpdateProfileValues) =>
      usersApi.updateProfile({
        displayName: values.displayName,
        avatarUrl: values.avatarUrl === "" ? null : values.avatarUrl,
      }),
    onSuccess: (updated) => {
      setSaved(true);
      // Let the confirmation register before the form disappears.
      setTimeout(() => onSaved(updated), 400);
    },
  });

  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<UpdateProfileValues>({
    resolver: zodResolver(updateProfileSchema),
    defaultValues: { displayName: user.displayName, avatarUrl: user.avatarUrl ?? "" },
  });

  async function onSubmit(values: UpdateProfileValues) {
    setFormError(null);
    try {
      await update.mutateAsync(values);
    } catch (error) {
      setFormError(applyApiFieldErrors(error, setError) ?? "تعذّر حفظ التغييرات.");
    }
  }

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      noValidate
      className="space-y-3 border-t border-border p-5"
    >
      {formError ? (
        <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-xs font-medium text-danger">
          {formError}
        </p>
      ) : null}

      <Input
        {...register("displayName")}
        label="الاسم المعروض"
        error={errors.displayName?.message}
        disabled={isSubmitting}
      />

      <Input
        {...register("avatarUrl")}
        label="رابط الصورة"
        type="url"
        dir="ltr"
        className="text-start"
        placeholder="https://…"
        hint="اتركه فارغاً لعرض الأحرف الأولى"
        error={errors.avatarUrl?.message}
        disabled={isSubmitting}
      />

      <div className="flex gap-2 pt-1">
        <Button type="submit" size="sm" loading={isSubmitting} fullWidth>
          {saved ? <Check className="size-3.5" /> : null}
          {saved ? "تم الحفظ" : "حفظ"}
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          fullWidth
          onClick={() => {
            reset();
            onCancel();
          }}
          disabled={isSubmitting}
        >
          إلغاء
        </Button>
      </div>
    </form>
  );
}

/** Logout, with the confirmation that a destructive sign-out deserves. */
export function LogoutSection() {
  const { logout } = useSession();
  const [confirming, setConfirming] = useState(false);
  const [isWorking, setIsWorking] = useState(false);

  if (!confirming) {
    return (
      <div className="border-t border-border p-5">
        <Button variant="secondary" size="sm" fullWidth onClick={() => setConfirming(true)}>
          <LogOut className="size-3.5" />
          تسجيل الخروج
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3 border-t border-border p-5">
      <p className="flex items-start gap-2 text-xs text-fg-muted">
        <ShieldCheck className="mt-0.5 size-3.5 shrink-0" />
        هل تريد تسجيل الخروج؟ سيلغي ذلك صلاحية الجلسة على هذا الجهاز.
      </p>
      <div className="flex gap-2">
        <Button
          variant="danger"
          size="sm"
          fullWidth
          loading={isWorking}
          onClick={async () => {
            setIsWorking(true);
            await logout();
          }}
        >
          نعم، خروج
        </Button>
        <Button variant="secondary" size="sm" fullWidth onClick={() => setConfirming(false)}>
          إلغاء
        </Button>
      </div>
    </div>
  );
}
