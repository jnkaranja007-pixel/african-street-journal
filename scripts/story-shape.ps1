#Requires -Version 5.1
<#
.SYNOPSIS
  The single definition of a well-formed story package. Dot-sourced by both
  add-briefs.ps1 (which drops defective stories) and validate-briefs.ps1 (which
  refuses to publish them).
.DESCRIPTION
  These checks lived in both scripts and drifted, which made the drop-guard useless:
  on 27 August a South Sudan story was kept by the merge at 218 words and rejected by
  the gate at 221, so the edition failed with 243 sound stories in hand.

  The cause was a one-character difference in a regex. The merge treated U+2019, the
  curly apostrophe, as a word-joining character and the gate did not, so "Kenya's"
  counted as one word in one place and two in the other. The counts were never going
  to agree, and a guard that measures differently from the gate it protects only looks
  like protection.

  Anything that decides whether a story is publishable belongs in this file. Two
  implementations of the same rule will always drift; the only question is when.
#>

# Word-joining characters: straight apostrophe, curly apostrophe, hyphen. Both counters
# must treat these identically or the totals diverge on ordinary English possessives.
$script:STORY_WORD_PATTERN = "[\p{L}\p{N}]+(?:['" + [char]0x2019 + "-][\p{L}\p{N}]+)*"

function Get-StoryBodyText($Story) {
  # Count the paragraphs, not the body field. They should be identical, but the
  # paragraphs array is what the reader sees and what the contract is written against.
  $paragraphs = @($Story.paragraphs | ForEach-Object { [string]$_ } | Where-Object { $_.Trim() })
  if ($paragraphs.Count) { return ($paragraphs -join ' ').Trim() }
  return ([string]$Story.body).Trim()
}

function Get-StoryWordCount([string]$Text) {
  if (-not $Text) { return 0 }
  return ([regex]::Matches($Text, $script:STORY_WORD_PATTERN)).Count
}

function Get-StoryShapeIssue($Story, [int]$MinWords, [int]$MaxWords, $SeenArticleIds) {
  # Returns a description of the first problem, or $null when the story is publishable.
  # Only full story packages are checked; anything without paragraphs is a different
  # shape and is covered by the caller's own emptiness checks.
  if (-not $Story.paragraphs) { return $null }

  $id = [string]$Story.articleId
  if (-not $id) { return 'missing articleId' }
  if ($SeenArticleIds -and -not $SeenArticleIds.Add($id)) { return "duplicate articleId $id" }

  $paragraphs = @($Story.paragraphs | ForEach-Object { [string]$_ } | Where-Object { $_.Trim() })
  if ($paragraphs.Count -lt 3 -or $paragraphs.Count -gt 6) { return "$($paragraphs.Count) paragraphs, need 3-6" }

  $wc = Get-StoryWordCount (Get-StoryBodyText $Story)
  if ($wc -lt $MinWords -or $wc -gt $MaxWords) { return "$wc words, need $MinWords-$MaxWords" }

  if (-not $Story.dek) { return 'missing dek' }
  if (([string]$Story.dek).Length -gt 200) { return 'dek over 200 chars' }
  if (-not $Story.why) { return 'missing why' }
  if (-not $Story.published) { return 'missing published time' }
  if (([string]$Story.headline).Length -gt 100) { return 'headline over 100 chars' }
  $srcs = @($Story.sources | Where-Object { $_ -and $_.url })
  if (-not $srcs.Count) { return 'no reporting source' }
  return $null
}
