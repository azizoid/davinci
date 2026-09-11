# Media And Licensing Policy

## Principle

Every asset in a delivered video MUST be either user-provided with permission for the intended use, created within an explicitly approved generation policy, or acquired from an approved source under terms compatible with that use. Availability on the internet is not evidence of permission.

## Approved Source Classes

- Media supplied by the user for the job.
- Original media already registered in an approved project library.
- Licensed stock providers explicitly enabled for the project, such as Pexels, accessed through an approved API or permitted download mechanism.
- Public-domain or permissively licensed media whose status and source can be recorded and verified.
- Generated media only when the project profile explicitly allows it and its model, inputs, and usage restrictions are recorded.

An implementation MUST maintain a configurable allowlist. Naming a provider here does not permanently approve every asset, endpoint, or use; current provider terms MUST be checked at acquisition time.

## Prohibited Sources And Actions

- Search-result thumbnails, social posts, news footage, films, television, or music without documented usage rights.
- Assets with missing, ambiguous, incompatible, or unverifiable terms.
- Downloads that bypass authentication, watermarks, rate limits, paywalls, robots controls, or provider restrictions.
- Re-uploaded stock when the original licensor and license cannot be verified.
- Logos, trademarks, identifiable people, private property, or sensitive events used in a misleading or defamatory context.
- Media whose license forbids the intended commercial, derivative, geographic, or distribution use.

## Acquisition Requirements

Before an external asset enters the timeline, the system MUST record:

- provider and canonical asset URL or provider asset ID;
- creator name or account when provided;
- acquisition timestamp;
- license name or terms URL and a captured text or immutable evidence reference when practical;
- the intended use and any restrictions or attribution requirement;
- original filename, media type, duration or dimensions, and cryptographic checksum;
- the query or editorial reason used to select it;
- whether human subjects, brands, or sensitive contexts require extra review.

Provider credentials MUST be read from secure configuration and MUST NOT be copied into job artifacts, logs, reports, Resolve metadata, or results.

## Pexels And Similar Providers

- Use official APIs or provider-approved download flows.
- Revalidate current API and license terms during implementation and whenever recorded terms change; do not hard-code assumptions from this document.
- Preserve the provider asset ID, source URL, creator information, and license evidence even when attribution is not required.
- Follow provider requirements for attribution, API usage, caching, redistribution, and prohibited uses.
- Do not deliver an unmodified stock asset as a standalone substitute for the provider's service.

## Editorial Use Constraints

- An asset MUST be relevant to the narration and MUST NOT materially misrepresent a person, place, product, event, or claim.
- Generic illustrative footage SHOULD be treated as illustrative in the edit report and, where audience confusion is plausible, in the video.
- Sensitive subjects including health, crime, politics, disasters, and identity require conservative selection and contextual accuracy.
- The system MUST avoid recognizable people in contexts that imply unsupported behavior, diagnosis, endorsement, or wrongdoing.

## Music, Fonts, And Graphics

- Music is external media and follows the same provenance requirements as footage.
- The system MUST confirm synchronization, territory, platform, and commercial-use rights when applicable.
- Fonts, templates, motion graphics, sound effects, and images MUST also have documented rights; they are not exempt because they are embedded in a project.

## Provenance And Delivery

- One provenance record MUST exist for each external asset, including assets later rejected from the final timeline if they were downloaded.
- The final report MUST distinguish assets used in the render from considered or rejected assets.
- Required attribution MUST be included in the output or accompanying credits exactly as the governing terms require.
- License evidence and checksums MUST remain with the job even if cached media is deleted.

## Failure Behavior

If licensing cannot be established, the system MUST reject the asset. It SHOULD search another approved source or complete a clean talking-head edit without B-roll. Missing optional stock footage is not sufficient reason to use uncertain media or block the entire edit.
