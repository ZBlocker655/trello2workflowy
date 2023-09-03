<#
This script will perform the full migration of all tech learning materials to the final output file.

Command line arguments:
    -w, --workspace: The path where input files are to be found as well as where output files will be written.
    -t, --techbookspath: The path to the directory of downloaded tech books.

The contents of the workspace path are expected to be:
- trello.json: The Trello board export file.
- tag_mappings.json: The tag mappings file.
#>

param (
    [Parameter(Mandatory=$true)]
    [string]$workspace,
    [Parameter(Mandatory=$true)]
    [string]$techBooksPath,
    [Parameter(Mandatory=$true)]
    [string]$email
)

# Set the path to the output file.
$outputFile = Join-Path $workspace "tech_learning_materials.json"

# Set the path to the tag mappings file.
$tagMappingsFile = Join-Path $workspace "tag_mappings.json"

# Set the path to the Trello board export file.
$trelloFile = Join-Path $workspace "trello.json"

# Run import_trello.js to import the Trello board export file.
node import_trello.js $trelloFile

# Run import_techbooks.js to import the tech books.
node import_books.js $techBooksPath $tagMappingsFile $outputFile

# Run clean_data.js to clean the data.
node clean_data.js $outputFile

# Run export_workflowy.js
node export_workflowy.js $outputFile $email
