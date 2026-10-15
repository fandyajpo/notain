import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createTemplate,
  deleteTemplate,
  listTemplates,
  listTemplatesPage,
  updateTemplate,
} from '../../../app/templates';
import { queryPolicy } from '../policies';
import { queryKeys } from '../keys';
import type { AuthoredTemplate, InvoiceTemplate } from '../../../core/template/model';

/**
 * The user's saved templates. Built-ins are not part of this cache — they are
 * free, immutable and always in the bundle, so there is nothing to fetch.
 */
export function useTemplates() {
  return useQuery({
    queryKey: queryKeys.templates,
    queryFn: () => listTemplates(),
    ...queryPolicy('templates'),
  });
}

/**
 * The `/templates` page's own cursor-paginated grid ("Muat lebih banyak").
 * Kept apart from `useTemplates`, which the invoice builder still needs whole.
 */
export function useTemplatesPage() {
  return useInfiniteQuery({
    queryKey: queryKeys.templatesPage,
    queryFn: ({ pageParam }) => listTemplatesPage({ cursorAfter: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    ...queryPolicy('templatesPage'),
  });
}

export function useCreateTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: AuthoredTemplate) => createTemplate(input),
    onSuccess: (template) => {
      queryClient.setQueryData(queryKeys.template(template.id), template);
      void queryClient.invalidateQueries({ queryKey: queryKeys.templates });
      void queryClient.invalidateQueries({ queryKey: queryKeys.templatesPage });
    },
  });
}

export function useUpdateTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, template }: { id: string; template: AuthoredTemplate }) =>
      updateTemplate(id, template),
    onSuccess: (saved) => {
      queryClient.setQueryData(queryKeys.template(saved.id), saved);
      void queryClient.invalidateQueries({ queryKey: queryKeys.templates });
      void queryClient.invalidateQueries({ queryKey: queryKeys.templatesPage });
    },
  });
}

/**
 * Drops the row from the cache before the request goes out so the picker stops
 * offering a template the moment it is removed, and puts it back if the delete
 * turns out to have failed.
 */
export function useDeleteTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteTemplate(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.templates });
      const previous = queryClient.getQueryData<InvoiceTemplate[]>(queryKeys.templates);

      queryClient.setQueryData<InvoiceTemplate[]>(queryKeys.templates, (current) =>
        current ? current.filter((template) => template.id !== id) : current,
      );

      return { previous };
    },
    onError: (_error, _id, context) => {
      if (context?.previous) queryClient.setQueryData(queryKeys.templates, context.previous);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.templates });
      void queryClient.invalidateQueries({ queryKey: queryKeys.templatesPage });
    },
  });
}
