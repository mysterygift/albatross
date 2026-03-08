# Canonical Crew Department Hierarchy

This file is the **canonical reference** for crew departments, Head of Department (HOD) roles, and ordered roles within each department. It is used by:

- **Crew Manager** — department and role dropdowns, HOD assignment and validation
- **Tasks** — department assignment and HOD responsibility logic (via mapping to existing task departments)
- **Call sheets** — crew grouping and HOD-first ordering

The same hierarchy is exported in code form in `crewDepartments.ts`; that module is the single source of truth for runtime use. This markdown is for human reference and must be kept in sync with the TypeScript export.

---

## Task department alignment (for future integration)

Tasks currently use `PRODUCTION_DEPARTMENTS` from `@/lib/productions/departments`. When integrating crew hierarchy with task assignment, map canonical crew department names as follows where labels differ:

| Canonical crew department | Task department (PRODUCTION_DEPARTMENTS) |
|---------------------------|------------------------------------------|
| Lighting                  | Electrical                               |
| Post-Production           | Post Production                          |
| Finance                   | Accounts                                 |
| Art                       | Art Department                           |
| Development               | Producers / Direction (context-dependent) |

Other crew departments (Production, Locations, Camera, Grip, Sound) match existing task labels or can be added to task dropdowns as needed.

---

## Departments, HODs, and roles

Order below is canonical: it drives call-sheet crew ordering and UI grouping.

### Development

- **Head of Department (HOD):** Producer
- **Roles:**
  - Studio Executive
  - Screenwriter
  - Script Editor
  - Producer
  - Executive Producer
  - Director
  - Casting Director
  - Casting Assistant
  - Researcher

### Production

- **Head of Department (HOD):** Line Producer
- **Roles:**
  - Production Assistant
  - Floor Runner
  - Production Secretary
  - Assistant Production Coordinator
  - Production Coordinator
  - Production Manager
  - Assistant Director
  - Line Producer

### Finance

- **Head of Department (HOD):** Production Accountant
- **Roles:**
  - Cashier
  - Production Accountant
  - Finance Controller

### Locations

- **Head of Department (HOD):** Locations Manager
- **Roles:**
  - Locations Marshall
  - Locations Trainee
  - Locations Assistant
  - Unit Manager
  - Assistant Locations Manager
  - Locations Manager

### Art

- **Head of Department (HOD):** Production Designer
- **Roles:**
  - Art Department Trainee
  - Costume Trainee
  - Hair and Make Up Trainee
  - Set Decorator
  - Costume Designer
  - Hair and Make Up Designer
  - Construction Manager
  - Production Buyer
  - Prop Master
  - Production Designer

### Camera

- **Head of Department (HOD):** Director of Photography
- **Roles:**
  - Camera Trainee
  - 2nd Assistant Camera
  - 1st Assistant Camera
  - Camera Operator
  - Video Assist Trainee
  - Video Assist Operator
  - Digital Imaging Technician
  - Director of Photography

### Lighting

- **Head of Department (HOD):** Gaffer
- **Roles:**
  - Spark Trainee
  - Spark
  - Best Boy
  - Gaffer

### Grip

- **Head of Department (HOD):** Key Grip
- **Roles:**
  - Grip Trainee
  - Grip
  - Dolly Grip
  - Crane Grip
  - Jib Grip
  - Best Boy Grip
  - Key Grip

### Sound

- **Head of Department (HOD):** Sound Mixer
- **Roles:**
  - Sound Trainee
  - Sound Assistant
  - 2nd Assistant Sound
  - Boom Operator
  - Sound Mixer

### Post-Production

- **Head of Department (HOD):** Post-Production Supervisor
- **Roles:**
  - Post-Production Runner
  - Assistant Editor
  - Editor
  - Music Editor
  - Colourist
  - Bookings Coordinator
  - Archivist
  - Supervising Sound Editor
  - Post-Production Supervisor
  - Deliverables Producer
