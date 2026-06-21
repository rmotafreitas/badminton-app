import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useClubService, useUserService } from "@/di/container";
import { useDictionary } from "@/i18n";
import { Link } from "react-router-dom";
import { Table } from "@/components/ui";
import type { Column } from "@/components/ui";

export function UsersPage() {
  const { user } = useAuth();
  const clubService = useClubService();
  const userService = useUserService();
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [allClubs, setAllClubs] = useState<any[]>([]);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [selectedClubId, setSelectedClubId] = useState("");
  const [assigning, setAssigning] = useState(false);
  const [notification, setNotification] = useState<{
    type: "green" | "red";
    message: string;
  } | null>(null);
  const [showAssignForm, setShowAssignForm] = useState(false);

  const dict = useDictionary().users;
  const navDict = useDictionary().nav;
  const common = useDictionary().common;

  const isSystemAdmin = user?.roles?.includes("SYSTEM_ADMIN");

  useEffect(() => {
    const fetchUsers = async () => {
      if (!user?.clubId) return;
      try {
        const data = await clubService.getClubById(user.clubId);
        setUsers(data?.users || []);
      } catch (err) {
        console.error("Failed to fetch users", err);
      } finally {
        setLoading(false);
      }
    };
    fetchUsers();
  }, [user?.clubId, clubService]);

  useEffect(() => {
    if (!isSystemAdmin) return;
    const fetchAssignData = async () => {
      try {
        const [usersData, clubsData] = await Promise.all([
          userService.getAllUsers(),
          clubService.getAllClubs(),
        ]);
        setAllUsers(usersData);
        setAllClubs(clubsData);
      } catch (err) {
        console.error("Failed to fetch assignment data", err);
      }
    };
    fetchAssignData();
  }, [isSystemAdmin, userService, clubService]);

  const handleAssign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUserId || !selectedClubId) return;
    setAssigning(true);
    try {
      await clubService.assignUserToClub(selectedUserId, selectedClubId);
      setNotification({ type: "green", message: dict.userAssigned });
      setSelectedUserId("");
      setSelectedClubId("");
      setShowAssignForm(false);
    } catch (err) {
      console.error("Failed to assign user", err);
      setNotification({ type: "red", message: dict.assignFailed });
    } finally {
      setAssigning(false);
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
          className="text-blue-600 hover:text-blue-800"
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
              className="inline-block bg-blue-100 text-blue-800 text-xs px-2 rounded-full uppercase font-semibold tracking-wide"
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
          className="text-gray-500"
          title={new Date(u.createdAt).toLocaleString()}
        >
          {new Date(u.createdAt).toLocaleDateString()}
        </small>
      ),
    },
  ];

  return (
    <>
      <section className="is-title-bar">
        <div className="flex flex-col md:flex-row items-center justify-between space-y-6 md:space-y-0">
          <ul>
            <li>{navDict.admin}</li>
            <li>{dict.clubUsers}</li>
          </ul>
        </div>
      </section>

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
                          {allUsers.map((u) => (
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
                          {allClubs.map((c) => (
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
                        disabled={assigning}
                      >
                        {assigning ? dict.assigning : dict.assign}
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
          loading={loading}
          emptyMessage={dict.noUsersFound}
          loadingMessage={common.loading}
        />
      </section>
    </>
  );
}
