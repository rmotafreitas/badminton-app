import { useEffect, useState } from "react";
import { useClubService } from "@/di/container";
import { useAuth } from "@/hooks/useAuth";
import { useDictionary } from "@/i18n";

export function ClubsPage() {
  const { user } = useAuth();
  const clubService = useClubService();
  const [clubs, setClubs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [newClubName, setNewClubName] = useState("");
  const [newClubLocation, setNewClubLocation] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [editingClub, setEditingClub] = useState<any>(null);
  const [editName, setEditName] = useState("");
  const [editLocation, setEditLocation] = useState("");
  const [updating, setUpdating] = useState(false);

  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [notification, setNotification] = useState<{ type: "green" | "red"; message: string } | null>(null);

  const dict = useDictionary().clubs;
  const gameDict = useDictionary().games;
  const navDict = useDictionary().nav;
  const common = useDictionary().common;

  useEffect(() => {
    fetchClubs();
  }, [clubService]);

  const fetchClubs = async () => {
    try {
      const data = await clubService.getAllClubs();
      setClubs(data);
    } catch (err) {
      console.error("Failed to fetch clubs", err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateClub = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newClubName) return;
    try {
      setSubmitting(true);
      await clubService.createClub({ name: newClubName, location: newClubLocation });
      setNewClubName("");
      setNewClubLocation("");
      await fetchClubs();
      setNotification({ type: "green", message: dict.success || "Club created." });
    } catch (err) {
      console.error("Failed to create club", err);
      setNotification({ type: "red", message: common.somethingWentWrong });
    } finally {
      setSubmitting(false);
    }
  };

  const handleEditClub = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingClub) return;
    try {
      setUpdating(true);
      await clubService.updateClub(editingClub.id, { name: editName, location: editLocation });
      setEditingClub(null);
      await fetchClubs();
      setNotification({ type: "green", message: dict.clubUpdated });
    } catch (err) {
      console.error("Failed to update club", err);
      setNotification({ type: "red", message: common.somethingWentWrong });
    } finally {
      setUpdating(false);
    }
  };

  const handleDeleteClub = async (clubId: string) => {
    setDeleting(true);
    try {
      await clubService.deleteClub(clubId);
      setDeleteConfirm(null);
      await fetchClubs();
      setNotification({ type: "green", message: dict.clubDeleted });
    } catch (err) {
      console.error("Failed to delete club", err);
      setNotification({ type: "red", message: common.somethingWentWrong });
    } finally {
      setDeleting(false);
    }
  };

  if (!user?.roles?.includes("SYSTEM_ADMIN")) {
    return (
      <div className="p-8 text-center text-red-500">
        {dict.accessDenied}
      </div>
    );
  }

  return (
    <>
      <section className="is-title-bar">
        <div className="flex flex-col md:flex-row items-center justify-between space-y-6 md:space-y-0">
          <ul>
            <li>{navDict.admin}</li>
            <li>{dict.registeredClubs}</li>
          </ul>
        </div>
      </section>

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
                  <button type="submit" className="button blue" disabled={submitting || updating}>
                    {editingClub
                      ? (updating ? dict.updating : dict.updateClub)
                      : (submitting ? dict.creating : dict.createClub)}
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
            {loading ? (
              <div className="p-4 text-center">{common.loading}</div>
            ) : clubs.length === 0 ? (
              <div className="p-4 text-center text-gray-500">{dict.noClubsFound}</div>
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
                  {clubs.map((club) => (
                    <tr key={club.id}>
                      <td data-label={dict.name} className="font-bold">{club.name}</td>
                      <td data-label={dict.location}>{club.location || "-"}</td>
                      <td data-label={dict.created}>
                        <small className="text-gray-500" title={new Date(club.createdAt).toLocaleString()}>
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
                              <button className="button small red" onClick={() => handleDeleteClub(club.id)} disabled={deleting}>
                                {deleting ? common.loading : gameDict.yes}
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
