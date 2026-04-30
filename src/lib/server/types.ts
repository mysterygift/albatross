export type LinkState = 'unlinked' | 'publishing' | 'linked' | 'offline' | 'conflict' | 'unlinking'

export type ServerConnectionRow = {
  id: string
  display_name: string
  base_url: string
  workspace_id: string | null
  account_username: string
  last_validated_at: string | null
  created_at: string
}

export type LinkedProjectRow = {
  production_id: string
  connection_id: string
  remote_project_id: string
  remote_project_url: string | null
  linked_at: string
  last_synced_at: string | null
  link_state: LinkState
  baseline_etag: string | null
}

export type PublishJobRow = {
  id: string
  production_id: string
  connection_id: string
  status: string
  progress_stage: string | null
  progress_message: string | null
  total_bytes: number | null
  uploaded_bytes: number
  error_kind: string | null
  error_message: string | null
  created_at: string
  finished_at: string | null
}

export type ServerOutboxRow = {
  id: string
  production_id: string
  entity_table: string
  entity_id: string
  operation: string
  payload_json: string | null
  expected_updated_at: string | null
  created_at: string
  tries: number
  last_error: string | null
}

export type ServerMeResponse = {
  user: { id: string; username: string }
  workspaces?: Array<{ id: string; name: string }>
}

export type ServerProjectSummary = {
  id: string
  name: string
  slug?: string
  url?: string
}

export type PublishJobStatusResponse = {
  id: string
  status: 'pending_upload' | 'uploading' | 'validating' | 'importing' | 'succeeded' | 'failed'
  progress?: { stage: string; message: string }
  error?: { kind: string; message: string }
  remoteProjectId?: string
  remoteProjectUrl?: string
  members?: Array<{ userId: string; username: string; accessLevel: string }>
}
