import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useClubService, useUserService } from "@/di/container";
import { useDictionary } from "@/i18n";
import { Link } from "react-router-dom";
import { Table } from "@/components/ui";
import { SkeletonRows } from "@/components/ui";
import { useQuery, useMutation, invalidateQueries } from "@/hooks/useQuery";
import type { Column } from "@/components/ui";
import type { Club } from "@/core/domain/club";
import type { UserView } from "@/core/repositories/interfaces/user-repo";

export function UsersPage() {
  const { user } = useAuth();
  const clubService = useClubService();
  const userService = useUserService();

  const dict = useDictionary().users;
  const common = useDictionary().common;

  const isSystemAdmin = user?.roles?.includes("SYSTEM_ADMIN");
  const clubId = user?.clubId ?? "";

  // Roster lives on the club object — shares the cache with Dashboard/Games.
  const { data: clubData, isLoading: rosterLoading } = useQuery<Club>(
    ["club", clubId],
    () => clubService.getClubById(clubId),
    { enabled: !!clubId, staleTime: 60_000, persist: true },
  );

  const { data: allUsers } = useQuery<UserView[]>(
    ["users"],
    () => userService.getAllUsers(),
    { enabled: isSystemAdmin, staleTime: 60_000, persist: true },
  );

  const { data: allClubs } = useQuery<Club[]>(
    ["clubs"],
    () => clubService.getAllClubs(),
    { enabled: isSystemAdmin, staleTime: 60_000, persist: true },
  );

  const users = clubData?.users ?? [];

  const [selectedUserId, setSelectedUserId] = useState("");
  const [selectedClubId, setSelectedClubId] = useState("");
  const [showAssignForm, setShowAssignForm] = useState(false);
  const [notification, setNotification] = useState<{
    type: "green" | "red";
    message: string;
  } | null>(null);

  const assignMutation = useMutation(
    (vars: { userId: string; clubId: string }) =>
      clubService.assignUserToClub(vars.userId, vars.clubId),
    {
      onSuccess: async () => {
        // Roster (both the target club and the admin's own club) + user/club
        // lists must resync so the newly assigned user appears.
        invalidateQueries(
          ["clubs"],
          ["users"],
          ["club", selectedClubId],
          ["club", clubId],
        );
      },
    },
  );

  const handleAssign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUserId || !selectedClubId) return;
    try {
      await assignMutation.mutate({ userId: selectedUserId, clubId: selectedClubId });
      setNotification({ type: "green", message: dict.userAssigned });
      setSelectedUserId("");
      setSelectedClubId("");
      setShowAssignForm(false);
    } catch (err) {
      console.error("Failed to assign user", err);
      setNotification({ type: "red", message: dict.assignFailed });
    }
  };

  const columns: Column<any>[] = [
    {
      header: "",
      className: "image-cell",
      accessor: (u) => (
        <div className="image">
          <img
            src={
              u.profile?.photo ||
              `https://api.dicebear.com/9.x/initials/svg?seed=${encodeURIComponent(u.email || u.id)}`
            }
            className="rounded-full"
            alt=""
          />
        </div>
      ),
    },
    {
      header: dict.name,
      accessor: (u) => (
        <Link
          to={`/profile/${u.id}`}
          className="text-primary hover:text-primary/80"
        >
          {u.profile?.name || "-"}
        </Link>
      ),
    },
    {
      header: dict.email,
      accessor: (u) => u.email || "-",
    },
    {
      header: dict.roles,
      accessor: (u) => (
        <div className="flex flex-wrap gap-1">
          {u.roles?.map((r: string) => (
            <span
              key={r}
              className="inline-block bg-primary/10 text-primary text-xs px-2 rounded-full uppercase font-semibold tracking-wide"
            >
              {r.replace("_", " ")}
            </span>
          ))}
        </div>
      ),
    },
    {
      header: dict.joined,
      accessor: (u) => (
        <small
          className="text-muted-foreground"
          title={new Date(u.createdAt).toLocaleString()}
        >
          {new Date(u.createdAt).toLocaleDateString()}
        </small>
      ),
    },
  ];

  return (
    <>
      <section className="is-hero-bar">
        <div className="flex flex-col md:flex-row items-center justify-between space-y-6 md:space-y-0">
          <h1 className="title">{dict.clubUsers}</h1>
        </div>
      </section>

      <section className="section main-section">
        {notification && (
          <div className={`notification ${notification.type} mb-4`}>
            <div className="flex flex-col md:flex-row items-center justify-between space-y-3 md:space-y-0">
              <div>
                <span className="icon">
                  <i
                    className={`mdi ${notification.type === "green" ? "mdi-check" : "mdi-alert"}`}
                  ></i>
                </span>
                {notification.message}
              </div>
              <button
                type="button"
                className="button small textual"
                onClick={() => setNotification(null)}
              >
                {common.close}
              </button>
            </div>
          </div>
        )}

        {isSystemAdmin && (
          <div className="card mb-4 sm:mb-6">
            <header className="card-header">
              <p className="card-header-title">
                <span className="icon">
                  <i className="mdi mdi-account-plus"></i>
                </span>
                {dict.assignUserTitle}
              </p>
            </header>
            <div className="card-content">
              {showAssignForm ? (
                <form onSubmit={handleAssign}>
                  <div className="field grouped">
                    <div className="control expanded">
                      <div className="select">
                        <select
                          value={selectedUserId}
                          onChange={(e) => setSelectedUserId(e.target.value)}
                        >
                          <option value="">{dict.selectUser}</option>
                          {(allUsers ?? []).map((u) => (
                            <option key={u.id} value={u.id}>
                              {u.profile?.name || u.email} (
                              {u.clubId ? "Assigned" : "Unassigned"})
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div className="control expanded">
                      <div className="select">
                        <select
                          value={selectedClubId}
                          onChange={(e) => setSelectedClubId(e.target.value)}
                        >
                          <option value="">{dict.selectClub}</option>
                          {(allClubs ?? []).map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div className="control">
                      <button
                        type="submit"
                        className="button blue"
                        disabled={assignMutation.isPending}
                      >
                        {assignMutation.isPending ? dict.assigning : dict.assign}
                      </button>
                    </div>
                    <div className="control">
                      <button
                        type="button"
                        className="button light"
                        onClick={() => setShowAssignForm(false)}
                      >
                        {common.cancel}
                      </button>
                    </div>
                  </div>
                </form>
              ) : (
                <button
                  className="button blue"
                  onClick={() => setShowAssignForm(true)}
                >
                  <span className="icon">
                    <i className="mdi mdi-account-plus"></i>
                  </span>
                  {dict.assignUser}
                </button>
              )}
            </div>
          </div>
        )}

        <Table
          title={dict.playersAndStaff}
          titleIcon="mdi-account-multiple"
          columns={columns}
          data={users}
          loading={rosterLoading && users.length === 0}
          emptyMessage={dict.noUsersFound}
          loadingMessage={common.loading}
          skeletonRows={<SkeletonRows rows={5} cols={5} />}
        />
      </section>
    </>
  );
}
