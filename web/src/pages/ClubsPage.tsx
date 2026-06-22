import { useState } from "react";
import { useClubService } from "@/di/container";
import { useAuth } from "@/hooks/useAuth";
import { useDictionary } from "@/i18n";
import { Skeleton } from "@/components/ui";
import { useQuery, useMutation, invalidateQueries } from "@/hooks/useQuery";
import type { Club } from "@/core/domain/club";

export function ClubsPage() {
  const { user } = useAuth();
  const clubService = useClubService();

  const dict = useDictionary().clubs;
  const gameDict = useDictionary().games;
  const common = useDictionary().common;

  const { data: clubs, isLoading } = useQuery<Club[]>(
    ["clubs"],
    () => clubService.getAllClubs(),
    { staleTime: 60_000, persist: true },
  );
  const clubsList = clubs ?? [];

  const [newClubName, setNewClubName] = useState("");
  const [newClubLocation, setNewClubLocation] = useState("");

  const [editingClub, setEditingClub] = useState<Club | null>(null);
  const [editName, setEditName] = useState("");
  const [editLocation, setEditLocation] = useState("");

  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const [notification, setNotification] = useState<{ type: "green" | "red"; message: string } | null>(null);

  const createMutation = useMutation(
    (vars: { name: string; location?: string }) => clubService.createClub(vars),
    {
      onSuccess: () => invalidateQueries(["clubs"]),
    },
  );

  const updateMutation = useMutation(
    (vars: { id: string; data: { name?: string; location?: string } }) =>
      clubService.updateClub(vars.id, vars.data),
    {
      onSuccess: (_d, vars) =>
        invalidateQueries(["clubs"], ["club", vars.id]),
    },
  );

  const deleteMutation = useMutation(
    (id: string) => clubService.deleteClub(id),
    {
      onSuccess: (_d, id) => invalidateQueries(["clubs"], ["club", id]),
    },
  );

  const handleCreateClub = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newClubName) return;
    try {
      await createMutation.mutate({ name: newClubName, location: newClubLocation });
      setNewClubName("");
      setNewClubLocation("");
      setNotification({ type: "green", message: dict.success || "Club created." });
    } catch (err) {
      console.error("Failed to create club", err);
      setNotification({ type: "red", message: common.somethingWentWrong });
    }
  };

  const handleEditClub = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingClub) return;
    try {
      await updateMutation.mutate({
        id: editingClub.id,
        data: { name: editName, location: editLocation },
      });
      setEditingClub(null);
      setNotification({ type: "green", message: dict.clubUpdated });
    } catch (err) {
      console.error("Failed to update club", err);
      setNotification({ type: "red", message: common.somethingWentWrong });
    }
  };

  const handleDeleteClub = async (clubId: string) => {
    try {
      await deleteMutation.mutate(clubId);
      setDeleteConfirm(null);
      setNotification({ type: "green", message: dict.clubDeleted });
    } catch (err) {
      console.error("Failed to delete club", err);
      setNotification({ type: "red", message: common.somethingWentWrong });
    }
  };

  if (!user?.roles?.includes("SYSTEM_ADMIN")) {
    return (
      <div className="p-8 text-center text-destructive">
        {dict.accessDenied}
      </div>
    );
  }

  return (
    <>
      <section className="is-hero-bar">
        <div className="flex flex-col md:flex-row items-center justify-between space-y-6 md:space-y-0">
          <h1 className="title">{dict.registeredClubs}</h1>
        </div>
      </section>

      <section className="section main-section">
        {notification && (
          <div className={`notification ${notification.type} mb-4`}>
            <div className="flex flex-col md:flex-row items-center justify-between space-y-3 md:space-y-0">
              <div>
                <span className="icon"><i className={`mdi ${notification.type === "green" ? "mdi-check" : "mdi-alert"}`}></i></span>
                {notification.message}
              </div>
              <button type="button" className="button small textual" onClick={() => setNotification(null)}>
                {common.close}
              </button>
            </div>
          </div>
        )}

        <div className="card mb-4 sm:mb-6">
          <header className="card-header">
            <p className="card-header-title">
              <span className="icon"><i className="mdi mdi-plus"></i></span>
              {editingClub ? dict.editClubTitle : dict.createNewClub}
            </p>
          </header>
          <div className="card-content">
            <form onSubmit={editingClub ? handleEditClub : handleCreateClub}>
              <div className="field grouped">
                <div className="control expanded">
                  <input
                    className="input"
                    placeholder={dict.clubNamePlaceholder}
                    value={editingClub ? editName : newClubName}
                    onChange={(e) =>
                      editingClub
                        ? setEditName(e.target.value)
                        : setNewClubName(e.target.value)
                    }
                    required
                  />
                </div>
                <div className="control expanded">
                  <input
                    className="input"
                    placeholder={dict.locationPlaceholder}
                    value={editingClub ? editLocation : newClubLocation}
                    onChange={(e) =>
                      editingClub
                        ? setEditLocation(e.target.value)
                        : setNewClubLocation(e.target.value)
                    }
                  />
                </div>
                <div className="control">
                  <button type="submit" className="button blue" disabled={createMutation.isPending || updateMutation.isPending}>
                    {editingClub
                      ? (updateMutation.isPending ? dict.updating : dict.updateClub)
                      : (createMutation.isPending ? dict.creating : dict.createClub)}
                  </button>
                </div>
                {editingClub && (
                  <div className="control">
                    <button type="button" className="button light" onClick={() => setEditingClub(null)}>
                      {common.cancel}
                    </button>
                  </div>
                )}
              </div>
            </form>
          </div>
        </div>

        <div className="card has-table">
          <header className="card-header">
            <p className="card-header-title">
              <span className="icon"><i className="mdi mdi-home-group"></i></span>
              {dict.allClubs}
            </p>
          </header>
          <div className="card-content">
            {isLoading && clubsList.length === 0 ? (
              <div className="p-4 space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : clubsList.length === 0 ? (
              <div className="p-4 text-center text-muted-foreground">{dict.noClubsFound}</div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>{dict.name}</th>
                    <th>{dict.location}</th>
                    <th>{dict.created}</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {clubsList.map((club) => (
                    <tr key={club.id}>
                      <td data-label={dict.name} className="font-bold">{club.name}</td>
                      <td data-label={dict.location}>{club.location || "-"}</td>
                      <td data-label={dict.created}>
                        <small className="text-muted-foreground" title={new Date(club.createdAt).toLocaleString()}>
                          {new Date(club.createdAt).toLocaleDateString()}
                        </small>
                      </td>
                      <td className="actions-cell">
                        <div className="buttons right nowrap">
                          <button
                            className="button small blue"
                            onClick={() => {
                              setEditingClub(club);
                              setEditName(club.name);
                              setEditLocation(club.location || "");
                            }}
                          >
                            <span className="icon"><i className="mdi mdi-pencil"></i></span>
                          </button>
                          {deleteConfirm === club.id ? (
                            <>
                              <button className="button small red" onClick={() => handleDeleteClub(club.id)} disabled={deleteMutation.isPending}>
                                {deleteMutation.isPending ? common.loading : gameDict.yes}
                              </button>
                              <button className="button small light" onClick={() => setDeleteConfirm(null)}>
                                {gameDict.no}
                              </button>
                            </>
                          ) : (
                            <button className="button small red" onClick={() => setDeleteConfirm(club.id)}>
                              <span className="icon"><i className="mdi mdi-trash-can"></i></span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </section>
    </>
  );
}
