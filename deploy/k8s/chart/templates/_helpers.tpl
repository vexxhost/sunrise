{{- define "sunrise.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "sunrise.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{- define "sunrise.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "sunrise.labels" -}}
helm.sh/chart: {{ include "sunrise.chart" . }}
{{ include "sunrise.selectorLabels" . }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}

{{- define "sunrise.selectorLabels" -}}
app.kubernetes.io/name: {{ include "sunrise.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{- define "sunrise.serviceAccountName" -}}
{{- if .Values.serviceAccount.create }}
{{- default (include "sunrise.fullname" .) .Values.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.serviceAccount.name }}
{{- end }}
{{- end }}

{{- define "sunrise.configMapName" -}}
{{- default (include "sunrise.fullname" .) .Values.configMap.name | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "sunrise.secretName" -}}
{{- default (include "sunrise.fullname" .) .Values.secret.name | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "sunrise.image" -}}
{{- if .Values.image.digest }}
{{- printf "%s@%s" .Values.image.repository .Values.image.digest }}
{{- else }}
{{- printf "%s:%s" .Values.image.repository (.Values.image.tag | default .Chart.AppVersion) }}
{{- end }}
{{- end }}
